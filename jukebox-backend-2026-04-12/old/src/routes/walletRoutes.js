const { Router } = require('express');
const { walletController } = require('../controllers/walletController');
const { requireRole } = require('../middleware/auth');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

router.get('/balance', authenticate, requireRole(['artist', 'promoter', 'jukebox_owner', 'listener']), walletController.getBalance);
router.post('/transactions', authenticate, requireRole(['artist', 'promoter', 'jukebox_owner']), walletController.recordTransaction);

module.exports = router;


