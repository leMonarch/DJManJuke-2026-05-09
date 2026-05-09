const path = require('path');
const fs = require('fs/promises');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Les fichiers sont stockés dans media/ (api/media/) au même niveau que src/
// __dirname = src/services/, donc on remonte de 2 niveaux pour accéder à api/, puis media/
const mediaDir = path.join(__dirname, '..', '..', 'media');
const audioDir = path.join(mediaDir, 'audio');
const imageDir = path.join(mediaDir, 'images');

const ensureDirectories = async () => {
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(imageDir, { recursive: true });
};

const saveFile = async (file, targetDir) => {
  await ensureDirectories();
  const sourcePath = file.path;
  const targetPath = path.join(targetDir, file.filename);
  await fs.rename(sourcePath, targetPath);
  // Retourner le chemin relatif depuis api/ (pas depuis src/)
  // __dirname = src/services/, donc on remonte de 2 niveaux pour api/
  return path.relative(path.join(__dirname, '..', '..'), targetPath).replace(/\\/g, '/');
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
    throw new Error('ffmpeg-static n\'a pas pu trouver le binaire ffmpeg');
  }

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .setFfmpegPath(ffmpegPath) // Utiliser le binaire inclus
      .seekInput(15) // Se positionner à 15 secondes
      .frames(1) // Extraire 1 frame
      .output(outputPath)
      .on('end', () => {
        const relativePath = path.relative(path.join(__dirname, '..'), outputPath).replace(/\\/g, '/');
        resolve(relativePath);
      })
      .on('error', (err) => {
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


