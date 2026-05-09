const { getUserRevenueSummary, listPayoutsByUser, calculateUserBalances } = require('../services/revenueService');
const { createPayoutRequest } = require('../services/payoutService');
const { createStripeOnboardingLink } = require('../services/stripeConnectService');

const getSummary = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const summary = await getUserRevenueSummary(user.user_id);
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

const requestPayout = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { amount } = req.body ?? {};
    let normalizedAmount = Number(amount);

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      const balances = await calculateUserBalances(user.user_id);
      normalizedAmount = balances.available;
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ message: 'Aucun solde disponible à retirer.' });
    }

    const payout = await createPayoutRequest({ userId: user.user_id, amount: normalizedAmount });
    res.status(201).json({ payout });
  } catch (error) {
    next(error);
  }
};

const createStripeConnectLink = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const link = await createStripeOnboardingLink({ userId: user.user_id });
    res.json(link);
  } catch (error) {
    next(error);
  }
};

const getPayoutHistory = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const payouts = await listPayoutsByUser(user.user_id, { limit: 50 });
    res.json({ payouts });
  } catch (error) {
    next(error);
  }
};

const revenueController = {
  getSummary,
  requestPayout,
  getPayoutHistory,
  createStripeConnectLink,
};

module.exports = { revenueController };


