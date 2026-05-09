const { paymentService } = require('../services/paymentService');

const createPriorityPayment = async (req, res, next) => {
  try {
    const { songId, amount = 0.5, slug, currentSongId = null } = req.body;
    const effectiveSlug = slug || req.user?.jukebox_slug || 'default';
    const { clientSecret, paymentIntentId } = await paymentService.createPriorityPayment({
      songId,
      amount,
      slug: effectiveSlug,
      currentSongId,
      user: req.user,
    });
    res.status(201).json({ clientSecret, paymentIntentId });
  } catch (error) {
    next(error);
  }
};

const createGuestPriorityPayment = async (req, res, next) => {
  try {
    const { songId, amount = 0.5, slug, currentSongId = null } = req.body;
    const effectiveSlug = slug || 'default';
    const { clientSecret, paymentIntentId } = await paymentService.createGuestPriorityPayment({
      songId,
      amount,
      slug: effectiveSlug,
      currentSongId,
    });
    res.status(201).json({ clientSecret, paymentIntentId });
  } catch (error) {
    next(error);
  }
};

const createPriorityPaymentFromBalance = async (req, res, next) => {
  try {
    const { songId, amount = 0.5, slug, currentSongId = null } = req.body;
    const effectiveSlug = slug || req.user?.jukebox_slug || 'default';
    const { playlist } = await paymentService.createPriorityPaymentFromBalance({
      songId,
      amount,
      slug: effectiveSlug,
      currentSongId,
      user: req.user,
    });
    res.status(201).json({ playlist });
  } catch (error) {
    next(error);
  }
};

const createTrackPurchaseFromBalance = async (req, res, next) => {
  try {
    const { songId, slug } = req.body;
    const effectiveSlug = slug || req.user?.jukebox_slug || 'default';
    const result = await paymentService.createTrackPurchaseFromBalance({
      songId,
      slug: effectiveSlug,
      user: req.user,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const createBalanceTopUpIntent = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const { clientSecret, paymentIntentId } = await paymentService.createBalanceTopUpIntent({
      amount,
      user: req.user,
    });
    res.status(201).json({ clientSecret, paymentIntentId });
  } catch (error) {
    next(error);
  }
};

const confirmBalanceTopUp = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;
    const result = await paymentService.confirmBalanceTopUp({
      paymentIntentId,
      user: req.user,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const createTrackPurchaseIntent = async (req, res, next) => {
  try {
    const { songId, slug } = req.body;
    const { clientSecret, paymentIntentId } = await paymentService.createTrackPurchaseIntent({
      songId,
      slug,
      user: req.user,
    });
    res.status(201).json({ clientSecret, paymentIntentId });
  } catch (error) {
    next(error);
  }
};

const confirmTrackPurchase = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;
    const result = await paymentService.confirmTrackPurchase({
      paymentIntentId,
      user: req.user,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const confirmPriorityPayment = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;
    const { playlist } = await paymentService.confirmPriorityPayment({
      paymentIntentId,
      user: req.user,
    });
    res.status(200).json({ playlist });
  } catch (error) {
    next(error);
  }
};

const confirmGuestPriorityPayment = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;
    const { playlist } = await paymentService.confirmPriorityPayment({
      paymentIntentId,
      user: null,
    });
    res.status(200).json({ playlist });
  } catch (error) {
    next(error);
  }
};

const createGuestTrackPurchaseIntent = async (req, res, next) => {
  try {
    const { songId, slug } = req.body;
    const effectiveSlug = slug || 'default';
    const { clientSecret, paymentIntentId } = await paymentService.createGuestTrackPurchaseIntent({
      songId,
      slug: effectiveSlug,
    });
    res.status(201).json({ clientSecret, paymentIntentId });
  } catch (error) {
    next(error);
  }
};

const confirmGuestTrackPurchase = async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;
    const result = await paymentService.confirmTrackPurchase({
      paymentIntentId,
      user: null,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    await paymentService.processWebhook(req);
    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
};

const paymentController = {
  createPriorityPayment,
  createGuestPriorityPayment,
  createPriorityPaymentFromBalance,
  createTrackPurchaseFromBalance,
  createBalanceTopUpIntent,
  confirmBalanceTopUp,
  createTrackPurchaseIntent,
  confirmTrackPurchase,
  confirmPriorityPayment,
  confirmGuestPriorityPayment,
  createGuestTrackPurchaseIntent,
  confirmGuestTrackPurchase,
  handleWebhook,
};

module.exports = { paymentController };


