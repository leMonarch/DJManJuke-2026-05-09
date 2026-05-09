const { Router } = require('express');
const { revenueController } = require('../controllers/revenueController');
const { requireRole, requirePlan } = require('../middleware/auth');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

router.use(authenticate);

// Tous les utilisateurs authentifiés peuvent voir leur résumé de revenus
router.get('/summary', revenueController.getSummary);

// Les fonctionnalités avancées restent réservées aux jukebox owners / admins
router.use(requireRole(['jukebox_owner', 'admin']));

router.get('/payouts/history', revenueController.getPayoutHistory);
router.post('/payouts', requirePlan(['pro']), revenueController.requestPayout);
router.post('/stripe/onboarding-link', requirePlan(['pro']), revenueController.createStripeConnectLink);

module.exports = router;


