const { Router } = require('express');
const { paymentController } = require('../controllers/paymentController');
const { authenticate } = require('../middleware/authenticate');

const router = Router();

router.post('/priority', authenticate, paymentController.createPriorityPayment);
router.post('/priority/confirm', authenticate, paymentController.confirmPriorityPayment);
router.post('/priority/guest', paymentController.createGuestPriorityPayment);
router.post('/priority/guest/confirm', paymentController.confirmGuestPriorityPayment);
router.post('/priority-from-balance', authenticate, paymentController.createPriorityPaymentFromBalance);
router.post('/track-purchase-from-balance', authenticate, paymentController.createTrackPurchaseFromBalance);
router.post('/balance-topup', authenticate, paymentController.createBalanceTopUpIntent);
router.post('/balance-topup/confirm', authenticate, paymentController.confirmBalanceTopUp);
router.post('/track-purchase/intent', authenticate, paymentController.createTrackPurchaseIntent);
router.post('/track-purchase/confirm', authenticate, paymentController.confirmTrackPurchase);
router.post('/track-purchase/guest/intent', paymentController.createGuestTrackPurchaseIntent);
router.post('/track-purchase/guest/confirm', paymentController.confirmGuestTrackPurchase);
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;


