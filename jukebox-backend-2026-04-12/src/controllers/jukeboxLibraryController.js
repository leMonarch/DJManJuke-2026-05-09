const { jukeboxService } = require('../services/jukeboxService');

const listCatalog = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { songs } = await jukeboxService.getCatalogForUser(slug, req.user);
    res.json({ songs });
  } catch (error) {
    next(error);
  }
};

const addSong = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { songId } = req.body;
    if (!songId) {
      const error = new Error('songId is required');
      error.statusCode = 400;
      throw error;
    }
    const songs = await jukeboxService.addSongToJukebox(slug, Number(songId), req.user);
    res.status(201).json({ songs });
  } catch (error) {
    next(error);
  }
};

const removeSong = async (req, res, next) => {
  try {
    const { slug, songId } = req.params;
    const songs = await jukeboxService.removeSongFromJukebox(slug, Number(songId), req.user);
    res.json({ songs });
  } catch (error) {
    next(error);
  }
};

const jukeboxLibraryController = {
  listCatalog,
  addSong,
  removeSong,
};

module.exports = { jukeboxLibraryController };



