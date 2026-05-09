const { Router } = require('express');
const songRoutes = require('./songRoutes');
const jukeboxRoutes = require('./jukeboxRoutes');
const walletRoutes = require('./walletRoutes');
const paymentRoutes = require('./paymentRoutes');
const investmentRoutes = require('./investmentRoutes');
const revenueRoutes = require('./revenueRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const authRoutes = require('./authRoutes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/songs', songRoutes);
router.use('/jukebox', jukeboxRoutes);
router.use('/wallet', walletRoutes);
router.use('/payment', paymentRoutes);
router.use('/investments', investmentRoutes);
router.use('/revenue', revenueRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
