const path = require('path');
const fs = require('fs');
const { songService } = require('../services/songService');
const { pool } = require('../db/pool');

const list = async (req, res, next) => {
  try {
    const songs = await songService.listSongs(req.user);
    res.json({ songs });
  } catch (error) {
    next(error);
  }
};

const downloadByPayment = async (req, res, next) => {
  try {
    const { songId, paymentIntentId } = req.body ?? {};

    const numericSongId = Number(songId);
    if (!Number.isFinite(numericSongId)) {
      return res.status(400).json({ message: 'Invalid song id' });
    }

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    const [[paymentRow]] = await pool.query(
      `SELECT id
       FROM payments
       WHERE stripe_payment_id = ?
         AND amount >= 1
       LIMIT 1`,
      [paymentIntentId],
    );

    if (!paymentRow) {
      return res.status(403).json({ message: 'No purchase found for this payment.' });
    }

    const song = await songService.getSongById(numericSongId);
    if (!song || !song.file_path) {
      return res.status(404).json({ message: 'Song file not found.' });
    }

    const audioPath = path.join(__dirname, '..', song.file_path);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ message: 'Audio file missing on server.' });
    }

    res.download(audioPath, path.basename(audioPath));
  } catch (error) {
    next(error);
  }
};

const download = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const songId = Number(req.params.id);
    if (!Number.isFinite(songId)) {
      return res.status(400).json({ message: 'Invalid song id' });
    }

    const [[paymentRow]] = await pool.query(
      `SELECT id
       FROM payments
       WHERE amount >= 1
         AND current_user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.user_id],
    );

    if (!paymentRow) {
      return res.status(403).json({ message: 'No purchase found for this song.' });
    }

    const song = await songService.getSongById(songId);
    if (!song || !song.file_path) {
      return res.status(404).json({ message: 'Song file not found.' });
    }

    const audioPath = path.join(__dirname, '..', song.file_path);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ message: 'Audio file missing on server.' });
    }

    res.download(audioPath, path.basename(audioPath));
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const song = await songService.getSongById(req.params.id, req.user);
    res.json({ song });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      audioFile: req.files?.audio?.[0],
      imageFile: req.files?.image?.[0],
    };
    const song = await songService.createSong(payload, req.user);
    res.status(201).json({ song });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      audioFile: req.files?.audio?.[0],
      imageFile: req.files?.image?.[0],
    };
    const song = await songService.updateSong(req.params.id, payload, req.user);
    res.json({ song });
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await songService.deleteSong(req.params.id, req.user);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

const songController = {
  list,
  getById,
  create,
  update,
  remove,
  download,
  downloadByPayment,
};

module.exports = { songController };


