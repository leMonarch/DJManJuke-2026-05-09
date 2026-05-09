const investmentService = require('../services/investmentService');
const { jukeboxService } = require('../services/jukeboxService');

const listMine = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const investments = await investmentService.listInvestmentsForUser(user.user_id);
    res.json({ investments });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { songId, amount } = req.body;
    const investment = await investmentService.createInvestment({
      songId,
      userId: user.user_id,
      amount,
    });
    res.status(201).json({ investment });
  } catch (error) {
    next(error);
  }
};

const listForSong = async (req, res, next) => {
  try {
    const { songId } = req.params;
    const investments = await investmentService.listInvestmentsForSong(Number(songId));
    res.json({ investments });
  } catch (error) {
    next(error);
  }
};

const listCatalog = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { slug } = req.params;
    const { songs } = await jukeboxService.getCatalogForUser(slug, user);
    const songIds = songs.map((song) => song.id);
    const investmentMap = await investmentService.listInvestmentsForSongs(songIds);
    const enriched = songs.map((song) => ({
      ...song,
      investments: investmentMap.get(song.id) ?? [],
      is_golden: (investmentMap.get(song.id) ?? []).length > 0,
    }));
    res.json({ songs: enriched });
  } catch (error) {
    next(error);
  }
};

const investmentController = {
  listMine,
  create,
  listForSong,
  listCatalog,
};

module.exports = { investmentController };


