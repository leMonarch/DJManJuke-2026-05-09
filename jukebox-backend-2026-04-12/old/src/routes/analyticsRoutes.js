const { Router } = require('express');
const { analyticsController } = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

router.use(authenticate);

router.get('/overview', analyticsController.getOverview);

module.exports = router;


