const { walletService } = require('../services/walletService');

const getBalance = async (req, res, next) => {
  try {
    const balance = await walletService.getBalance(req.user.user_id);
    res.json({ balance });
  } catch (error) {
    next(error);
  }
};

const recordTransaction = async (req, res, next) => {
  try {
    const transaction = await walletService.recordTransaction({
      ...req.body,
      userId: req.user.user_id,
    });
    res.status(201).json({ transaction });
  } catch (error) {
    next(error);
  }
};

const walletController = {
  getBalance,
  recordTransaction,
};

module.exports = { walletController };


