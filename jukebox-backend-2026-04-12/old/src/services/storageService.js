const path = require('path');
const fs = require('fs/promises');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Les fichiers sont stockés dans DJManJuke/media/ à la racine du projet
// __dirname = backend/src/services
// .. = backend/src
// .. = backend
// .. = DJManJuke
// media = DJManJuke/media
const mediaDir = path.join(__dirname, '..', '..', '..', 'media');
const audioDir = path.join(mediaDir, 'audio');
const imageDir = path.join(mediaDir, 'images');

const ensureDirectories = async () => {
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(imageDir, { recursive: true });
};

const saveFile = async (file, targetDir) => {
  if (!file || !file.path || !file.filename) {
    throw new Error('Fichier invalide: path ou filename manquant');
  }
  
  await ensureDirectories();
  const sourcePath = file.path;
  const targetPath = path.join(targetDir, file.filename);
  
  console.log('[saveFile] Sauvegarde du fichier', {
    sourcePath,
    targetPath,
    filename: file.filename,
    originalname: file.originalname,
    size: file.size,
    sourceExists: require('fs').existsSync(sourcePath),
    targetDirExists: require('fs').existsSync(targetDir)
  });
  
  // Si le fichier est déjà au bon endroit (multer l'a déjà sauvegardé), pas besoin de le déplacer
  if (sourcePath !== targetPath) {
    try {
      // Vérifier que le fichier source existe
      const fsSync = require('fs');
      if (!fsSync.existsSync(sourcePath)) {
        throw new Error(`Le fichier source n'existe pas: ${sourcePath}`);
      }
      
      await fs.rename(sourcePath, targetPath);
      console.log('[saveFile] ✅ Fichier déplacé avec succès');
    } catch (error) {
      // Si le fichier existe déjà au même endroit, c'est OK
      if (error.code === 'EXDEV') {
        // Cross-device link, copier au lieu de renommer
        console.log('[saveFile] ⚠️ Cross-device, copie du fichier');
        await fs.copyFile(sourcePath, targetPath);
        await fs.unlink(sourcePath).catch(() => {}); // Supprimer l'original si possible
      } else if (error.code !== 'ENOENT') {
        console.error('[saveFile] ❌ Erreur lors du déplacement:', {
          error: error.message,
          code: error.code,
          sourcePath,
          targetPath
        });
        throw error;
      }
    }
  } else {
    console.log('[saveFile] ✅ Fichier déjà au bon endroit');
  }
  
  // Vérifier que le fichier final existe
  const fsSync = require('fs');
  if (!fsSync.existsSync(targetPath)) {
    throw new Error(`Le fichier final n'existe pas après sauvegarde: ${targetPath}`);
  }
  
  // Retourner le chemin relatif depuis la racine du projet
  // Les fichiers sont dans DJManJuke/media/audio/ et DJManJuke/media/images/
  // On retourne /media/audio/filename ou /media/images/filename
  const finalPath = sourcePath === targetPath ? sourcePath : targetPath;
  const relativePath = path.relative(mediaDir, finalPath).replace(/\\/g, '/');
  
  // S'assurer que le chemin commence toujours par /media/
  // path.relative(mediaDir, mediaDir/audio/file.mp3) retourne "audio/file.mp3"
  // On veut "/media/audio/file.mp3"
  const mediaPath = `/media/${relativePath}`;
  
  console.log('[saveFile] ✅ Fichier sauvegardé avec succès:', {
    finalPath,
    relativePath,
    mediaPath,
    targetDir,
    mediaDir
  });
  return mediaPath;
};

// saveAudio accepte aussi les fichiers vidéo (.mp4)
const saveAudio = async (file) => saveFile(file, audioDir);
const saveImage = async (file) => saveFile(file, imageDir);

/**
 * Extrait une frame vidéo à 15 secondes et la sauvegarde comme image
 * @param {string} videoPath - Chemin absolu vers le fichier vidéo
 * @param {string} outputFilename - Nom du fichier de sortie (sans extension)
 * @returns {Promise<string>} - Chemin relatif vers l'image générée
 */
const extractVideoFrame = async (videoPath, outputFilename) => {
  await ensureDirectories();
  const outputPath = path.join(imageDir, `${outputFilename}.jpg`);

  // Utiliser le binaire ffmpeg inclus dans ffmpeg-static
  if (!ffmpegPath) {
    const error = new Error('ffmpeg-static n\'a pas pu trouver le binaire ffmpeg');
    console.error('[extractVideoFrame] ❌', error.message);
    throw error;
  }

  // Vérifier que le fichier vidéo existe
  const fs = require('fs');
  if (!fs.existsSync(videoPath)) {
    const error = new Error(`Le fichier vidéo n'existe pas: ${videoPath}`);
    console.error('[extractVideoFrame] ❌', error.message);
    throw error;
  }

  console.log('[extractVideoFrame] Début de l\'extraction', {
    videoPath,
    outputPath,
    ffmpegPath,
    videoExists: fs.existsSync(videoPath),
    videoSize: fs.statSync(videoPath).size
  });

  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath)
      .setFfmpegPath(ffmpegPath) // Utiliser le binaire inclus
      .seekInput(15) // Se positionner à 15 secondes
      .frames(1) // Extraire 1 frame
      .output(outputPath)
      .outputOptions(['-q:v', '2']) // Qualité JPEG (2 = haute qualité)
      .on('start', (commandLine) => {
        console.log('[extractVideoFrame] Commande ffmpeg:', commandLine);
      })
      .on('progress', (progress) => {
        console.log('[extractVideoFrame] Progression:', progress.percent + '%');
      })
      .on('end', () => {
        // Vérifier que le fichier de sortie a été créé
        if (!fs.existsSync(outputPath)) {
          const error = new Error(`Le fichier de sortie n'a pas été créé: ${outputPath}`);
          console.error('[extractVideoFrame] ❌', error.message);
          return reject(error);
        }
        
        // Retourner le chemin relatif depuis mediaDir
        // path.relative(mediaDir, mediaDir/images/frame.jpg) retourne "images/frame.jpg"
        // On veut "/media/images/frame.jpg"
        const relativePath = path.relative(mediaDir, outputPath).replace(/\\/g, '/');
        const mediaPath = `/media/${relativePath}`;
        console.log('[extractVideoFrame] ✅ Frame extraite avec succès:', {
          outputPath,
          relativePath,
          mediaPath
        });
        resolve(mediaPath);
      })
      .on('error', (err) => {
        console.error('[extractVideoFrame] ❌ Erreur ffmpeg:', {
          message: err.message,
          stack: err.stack,
          videoPath,
          outputPath,
          ffmpegPath
        });
        reject(new Error(`Erreur lors de l'extraction de la frame vidéo: ${err.message}`));
      })
      .run();
  });
};

const fileService = {
  saveAudio,
  saveImage,
  extractVideoFrame,
};

module.exports = { fileService };


