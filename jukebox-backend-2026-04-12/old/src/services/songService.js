const { pool } = require('../db/pool');
const { fileService } = require('./storageService');
const investmentService = require('./investmentService');
const { jukeboxService } = require('./jukeboxService');

const ensureAuthenticated = (user) => {
  if (!user || !user.user_id) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }
};

const ensureOwnership = (song, user) => {
  if (!song || !user || song.user_id !== user.user_id) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
};

const getUserDefaultJukeboxId = async (user) => {
  if (!user || !user.user_id) {
    return null;
  }
  if (user.jukebox_id) {
    return user.jukebox_id;
  }
  const [rows] = await pool.query('SELECT default_jukebox_id FROM users WHERE user_id = ? LIMIT 1', [user.user_id]);
  return rows[0]?.default_jukebox_id ?? null;
};

const listSongs = async (user) => {
  ensureAuthenticated(user);
  const [rows] = await pool.query(
    `SELECT *
     FROM songs
     WHERE user_id = ?
     ORDER BY song_order_id ASC, id ASC`,
    [user.user_id],
  );
  const songIds = rows.map((row) => row.id);
  const investmentMap = await investmentService.listInvestmentsForSongs(songIds);
  return rows.map((row) => ({
    ...row,
    investments: investmentMap.get(row.id) ?? [],
    is_golden: (investmentMap.get(row.id) ?? []).length > 0,
  }));
};

const getSongById = async (id, user) => {
  const [rows] = await pool.query('SELECT * FROM songs WHERE id = ?', [id]);
  if (!rows.length) {
    const error = new Error('Song not found');
    error.statusCode = 404;
    throw error;
  }
  const song = rows[0];
  if (user) {
    ensureOwnership(song, user);
  }
  const investments = await investmentService.listInvestmentsForSong(song.id);
  return {
    ...song,
    investments,
    is_golden: investments.length > 0,
  };
};

const createSong = async (payload, user) => {
  ensureAuthenticated(user);
  const audioPath = payload.audioFile ? await fileService.saveAudio(payload.audioFile) : null;
  let imagePath = payload.imageFile ? await fileService.saveImage(payload.imageFile) : null;

  if (!audioPath) {
    const error = new Error('Audio file is required');
    error.statusCode = 400;
    throw error;
  }

  // Si aucun fichier image n'est fourni et que le fichier audio est une vidéo (.mp4),
  // extraire automatiquement une frame à 15 secondes
  if (!imagePath && payload.audioFile && audioPath.toLowerCase().endsWith('.mp4')) {
    try {
      const path = require('path');
      // audioPath est au format /media/audio/filename.mp4 ou media/audio/filename.mp4
      // Les fichiers sont stockés dans DJManJuke/media/audio/ à la racine du projet
      // __dirname = backend/src/services
      // .. = backend/src
      // .. = backend
      // .. = DJManJuke
      // media = DJManJuke/media
      let relativePath = audioPath.startsWith('/') ? audioPath.slice(1) : audioPath;
      const videoAbsolutePath = path.join(__dirname, '..', '..', '..', relativePath);
      
      console.log('[createSong] Extraction de frame vidéo', {
        audioPath,
        relativePath,
        videoAbsolutePath,
        fileExists: require('fs').existsSync(videoAbsolutePath)
      });
      
      const outputFilename = `frame-${Date.now()}-${path.parse(payload.audioFile.originalname).name}`;
      imagePath = await fileService.extractVideoFrame(videoAbsolutePath, outputFilename);
      console.log('[createSong] Frame vidéo extraite avec succès:', imagePath);
    } catch (err) {
      // Si l'extraction échoue, on continue sans image (ne pas bloquer la création)
      console.error('[createSong] ❌ Impossible d\'extraire une frame vidéo:', {
        error: err.message,
        stack: err.stack,
        audioPath,
        videoPath: audioPath ? path.join(__dirname, '..', '..', '..', audioPath.startsWith('/') ? audioPath.slice(1) : audioPath) : null
      });
      imagePath = null;
    }
  }

  const [result] = await pool.query(
    'INSERT INTO songs (title, artist, file_path, image, song_order_id, user_id, genre_primary, genre_secondary, genre_tertiary, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      payload.title,
      payload.artist,
      audioPath,
      imagePath,
      payload.song_order_id || 0,
      user?.user_id || null,
      payload.genre_primary || null,
      payload.genre_secondary || null,
      payload.genre_tertiary || null,
      payload.recorded_at || null,
    ],
  );

  const songId = result.insertId;
  const jukeboxId = await getUserDefaultJukeboxId(user);
  if (jukeboxId) {
    await jukeboxService.addSongToJukeboxById(jukeboxId, songId);
  }

  return getSongById(songId, user);
};

const updateSong = async (id, payload, user) => {
  ensureAuthenticated(user);
  const existing = await getSongById(id, user);
  const audioPath = payload.audioFile ? await fileService.saveAudio(payload.audioFile) : existing.file_path;
  let imagePath = payload.imageFile ? await fileService.saveImage(payload.imageFile) : existing.image;

  // Si un nouveau fichier vidéo est uploadé et qu'aucune image n'est fournie,
  // extraire automatiquement une frame à 15 secondes
  if (payload.audioFile && !payload.imageFile && audioPath.toLowerCase().endsWith('.mp4')) {
    try {
      const path = require('path');
      // audioPath est au format /media/audio/filename.mp4 ou media/audio/filename.mp4
      // Les fichiers sont stockés dans DJManJuke/media/audio/ à la racine du projet
      // __dirname = backend/src/services
      // .. = backend/src
      // .. = backend
      // .. = DJManJuke
      // media = DJManJuke/media
      let relativePath = audioPath.startsWith('/') ? audioPath.slice(1) : audioPath;
      const videoAbsolutePath = path.join(__dirname, '..', '..', '..', relativePath);
      
      console.log('[updateSong] Extraction de frame vidéo', {
        audioPath,
        relativePath,
        videoAbsolutePath,
        fileExists: require('fs').existsSync(videoAbsolutePath)
      });
      
      const outputFilename = `frame-${Date.now()}-${path.parse(payload.audioFile.originalname).name}`;
      imagePath = await fileService.extractVideoFrame(videoAbsolutePath, outputFilename);
      console.log('[updateSong] Frame vidéo extraite avec succès:', imagePath);
    } catch (err) {
      // Si l'extraction échoue, on garde l'image existante ou null
      console.error('[updateSong] ❌ Impossible d\'extraire une frame vidéo:', {
        error: err.message,
        stack: err.stack,
        audioPath,
        videoPath: audioPath ? path.join(__dirname, '..', audioPath.replace('/media/', 'assets/')) : null
      });
      imagePath = existing.image;
    }
  }

  await pool.query(
    'UPDATE songs SET title = ?, artist = ?, file_path = ?, image = ?, song_order_id = ?, genre_primary = ?, genre_secondary = ?, genre_tertiary = ?, recorded_at = ? WHERE id = ?',
    [
      payload.title ?? existing.title,
      payload.artist ?? existing.artist,
      audioPath,
      imagePath,
      payload.song_order_id ?? existing.song_order_id,
      payload.genre_primary !== undefined ? payload.genre_primary : existing.genre_primary,
      payload.genre_secondary !== undefined ? payload.genre_secondary : existing.genre_secondary,
      payload.genre_tertiary !== undefined ? payload.genre_tertiary : existing.genre_tertiary,
      payload.recorded_at !== undefined ? payload.recorded_at : existing.recorded_at,
      id,
    ],
  );

  return getSongById(id);
};

const deleteSong = async (id, user) => {
  ensureAuthenticated(user);
  await getSongById(id, user);
  await pool.query('DELETE FROM songs WHERE id = ?', [id]);
};

const songService = {
  listSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
};

module.exports = { songService };


