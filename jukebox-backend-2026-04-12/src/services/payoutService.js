const { pool } = require('../db/pool');
const { env } = require('../config/env');
const { stripeClient } = require('../lib/stripe');
const { calculateUserBalances } = require('./revenueService');

const mapStripePayoutStatus = (status) => {
  switch (status) {
    case 'paid':
      return 'paid';
    case 'in_transit':
    case 'pending':
      return 'processing';
    case 'canceled':
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
};

const fetchUserForPayout = async (connection, userId) => {
  const [[row]] = await connection.query(
    `SELECT
        user_id,
        email,
        plan,
        stripe_account_id,
        stripe_onboarding_complete,
        stripe_payouts_enabled
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );
  return row ?? null;
};

const createPayoutRequest = async ({ userId, amount }) => {
  const normalizedAmount = Number(amount);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    const error = new Error('Montant invalide pour un retrait.');
    error.statusCode = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const user = await fetchUserForPayout(connection, userId);
    if (!user) {
      const error = new Error('Utilisateur introuvable.');
      error.statusCode = 404;
      throw error;
    }

    if (user.plan !== 'pro') {
      const error = new Error('Seuls les comptes pro peuvent retirer des fonds.');
      error.statusCode = 403;
      throw error;
    }

    if (!user.stripe_account_id) {
      const error = new Error('Connectez votre compte Stripe pour retirer vos revenus.');
      error.statusCode = 409;
      throw error;
    }

    if (!user.stripe_onboarding_complete || !user.stripe_payouts_enabled) {
      const error = new Error('Votre compte Stripe n’est pas encore activé pour les retraits.');
      error.statusCode = 409;
      throw error;
    }

    const balances = await calculateUserBalances(userId, connection);
    if (normalizedAmount > balances.available + 0.0001) {
      const error = new Error('Montant supérieur à votre solde disponible.');
      error.statusCode = 400;
      throw error;
    }

    if (normalizedAmount < env.MIN_PAYOUT_AMOUNT) {
      const error = new Error(`Le montant minimal de retrait est de ${env.MIN_PAYOUT_AMOUNT.toFixed(2)}.`);
      error.statusCode = 400;
      throw error;
    }

    let status = 'pending';
    let stripePayoutId = null;
    let stripeTransferId = null;
    let processedAt = null;

    if (!stripeClient) {
      const error = new Error('Stripe n’est pas configuré côté serveur.');
      error.statusCode = 503;
      throw error;
    }

    // Vérifie le solde disponible côté Stripe pour éviter l’erreur "insufficient funds"
    const stripeBalance = await stripeClient.balance.retrieve({
      stripeAccount: user.stripe_account_id,
    });
    const currency = (env.STRIPE_DEFAULT_CURRENCY || 'cad').toLowerCase();
    const availableInCurrency = (stripeBalance.available || [])
      .filter((entry) => String(entry.currency).toLowerCase() === currency)
      .reduce((sum, entry) => sum + (Number(entry.amount ?? 0) / 100), 0);

    if (normalizedAmount > availableInCurrency + 0.0001) {
      const error = new Error(
        `Fonds Stripe insuffisants pour ce retrait. Solde Stripe disponible: ${availableInCurrency.toFixed(
          2,
        )} ${currency.toUpperCase()}, retrait demandé: ${normalizedAmount.toFixed(2)} ${currency.toUpperCase()}.`,
      );
      error.statusCode = 400;
      throw error;
    }

    const [payoutResult] = await connection.query(
      `INSERT INTO payouts (user_id, amount, currency, status)
       VALUES (?, ?, ?, ?)`,
      [userId, normalizedAmount, env.STRIPE_DEFAULT_CURRENCY, status],
    );
    const payoutId = payoutResult.insertId;

    const stripeResponse = await stripeClient.payouts.create(
      {
        amount: Math.round(normalizedAmount * 100),
        currency: env.STRIPE_DEFAULT_CURRENCY,
        statement_descriptor: 'DJMan Jukebox',
      },
      {
        stripeAccount: user.stripe_account_id,
      },
    );
    status = mapStripePayoutStatus(stripeResponse.status);
    stripePayoutId = stripeResponse.id;
    processedAt = stripeResponse.arrival_date ? new Date(stripeResponse.arrival_date * 1000) : null;

    await connection.query(
      `UPDATE payouts
         SET status = ?, stripe_payout_id = ?, stripe_transfer_id = ?, processed_at = ?
         WHERE id = ?`,
      [status, stripePayoutId, stripeTransferId, processedAt, payoutId],
    );

    await connection.commit();

    return {
      id: payoutId,
      amount: normalizedAmount,
      currency: env.STRIPE_DEFAULT_CURRENCY,
      status,
      stripePayoutId,
      stripeTransferId,
      processedAt,
    };
  } catch (error) {
    await connection.rollback();

    if (!error.statusCode) {
      error.statusCode = 500;
    }
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  createPayoutRequest,
};

