const { jukeboxService } = require('../services/jukeboxService');

const getPlaylist = async (req, res, next) => {
  try {
    const playlist = await jukeboxService.getPlaylist(req.params.slug);
    res.json({ playlist });
  } catch (error) {
    next(error);
  }
};

const getMeta = async (req, res, next) => {
  try {
    const jukebox = await jukeboxService.getJukeboxBySlug(req.params.slug);
    if (!jukebox) {
      return res.status(404).json({ message: 'Jukebox not found' });
    }
    return res.json({
      id: jukebox.id,
      slug: jukebox.slug,
      name: jukebox.name,
      location: jukebox.location ?? null,
      playbackMode: jukebox.playback_mode ?? 'private',
    });
  } catch (error) {
    next(error);
  }
};

const reloadPlaylist = async (req, res, next) => {
  try {
    const playlist = await jukeboxService.reloadPlaylist(req.params.slug);
    res.json({ playlist });
  } catch (error) {
    next(error);
  }
};

const prioritizeSong = async (req, res, next) => {
  try {
    const { songId, amount, currentSongId = null } = req.body;
    const playlist = await jukeboxService.prioritizeSong(
      req.params.slug,
      songId,
      amount,
      currentSongId,
      req.user?.user_id ?? null,
    );
    res.json({ playlist });
  } catch (error) {
    next(error);
  }
};

const completeSong = async (req, res, next) => {
  try {
    const { songId, currentSongId = null } = req.body;
    const playlist = await jukeboxService.completeSong(req.params.slug, songId, currentSongId);
    res.json({ playlist });
  } catch (error) {
    next(error);
  }
};

const previewPriority = async (req, res, next) => {
  try {
    const { songId, amount = 0.5, currentSongId = null } = req.body ?? {};
    const { slug } = req.params;
    const result = await jukeboxService.previewPriorityForSong({
      slug,
      songId,
      amount,
      currentSongId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const updateLocationFromCoords = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (user.jukebox_slug !== req.params.slug && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { address } = req.body ?? {};

    if (!address || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({ message: "L'adresse est requise." });
    }

    const jukebox = await jukeboxService.updateJukeboxLocation(req.params.slug, address.trim());
    return res.json({ jukebox });
  } catch (error) {
    next(error);
  }
};

const listLocations = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (user.jukebox_slug !== req.params.slug && user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const locations = await jukeboxService.listJukeboxLocations(req.params.slug);
    return res.json({ locations });
  } catch (error) {
    next(error);
  }
};

const skipToNext = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const playlist = await jukeboxService.skipToNext({
      slug: req.params.slug,
      user,
    });
    return res.json({ playlist });
  } catch (error) {
    next(error);
  }
};

const skipToPrevious = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const playlist = await jukeboxService.skipToPrevious({
      slug: req.params.slug,
      user,
    });
    return res.json({ playlist });
  } catch (error) {
    next(error);
  }
};
const cancelPriorityForCurrentUser = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { songId, currentSongId = null } = req.body ?? {};
    if (!songId) {
      return res.status(400).json({ message: 'songId is required' });
    }

    const playlist = await jukeboxService.cancelPriorityForSong({
      slug: req.params.slug,
      songId,
      userId: user.user_id,
      currentSongId,
    });
    return res.json({ playlist });
  } catch (error) {
    next(error);
  }
};

const updatePlaybackMode = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { playbackMode } = req.body ?? {};
    if (!playbackMode) {
      return res.status(400).json({ message: 'playbackMode is required' });
    }

    const jukebox = await jukeboxService.updatePlaybackMode(req.params.slug, playbackMode, user);
    return res.json({ jukebox });
  } catch (error) {
    next(error);
  }
};

const getAllJukeboxes = async (req, res, next) => {
  try {
    const jukeboxes = await jukeboxService.getAllJukeboxes();
    return res.json({ jukeboxes });
  } catch (error) {
    next(error);
  }
};

const jukeboxController = {
  getPlaylist,
  getMeta,
  getAllJukeboxes,
  reloadPlaylist,
  prioritizeSong,
  completeSong,
  updateLocationFromCoords,
  previewPriority,
  listLocations,
  skipToNext,
  skipToPrevious,
  cancelPriorityForCurrentUser,
  updatePlaybackMode,
};

module.exports = { jukeboxController };


