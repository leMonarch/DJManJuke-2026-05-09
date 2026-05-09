const { Router } = require('express');
const { investmentController } = require('../controllers/investmentController');
const { requireRole, requirePlan } = require('../middleware/auth');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

router.use(authenticate, requireRole(['jukebox_owner', 'admin']), requirePlan(['pro']));

router.get('/mine', investmentController.listMine);
router.get('/song/:songId', investmentController.listForSong);
router.get('/catalog/:slug', investmentController.listCatalog);
router.post('/', investmentController.create);

module.exports = router;


