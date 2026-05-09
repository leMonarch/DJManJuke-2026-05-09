const { pool } = require('../db/pool');
const { env } = require('../config/env');
const { stripeClient } = require('../lib/stripe');

const getUserById = async (userId) => {
  const [rows] = await pool.query(
    `SELECT user_id, email
       FROM users
      WHERE user_id = ?
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
};

const createProSubscriptionCheckoutSession = async ({ userId }) => {
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Starting, userId:', userId);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Stripe configured:', !!stripeClient);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] STRIPE_PRO_PRICE_ID:', env.STRIPE_PRO_PRICE_ID ? 'Set' : 'Missing');
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] APP_BASE_URL:', env.APP_BASE_URL);

  if (!stripeClient) {
    const error = new Error('Stripe is not configured for subscriptions.');
    error.statusCode = 503;
    throw error;
  }

  if (!env.STRIPE_PRO_PRICE_ID) {
    const error = new Error('Pro subscription price is not configured.');
    error.statusCode = 500;
    throw error;
  }

  const user = await getUserById(userId);
  if (!user) {
    const error = new Error('Utilisateur introuvable.');
    error.statusCode = 404;
    throw error;
  }

  const successUrl = `${env.APP_BASE_URL}/login?subscription=success`;
  const cancelUrl = `${env.APP_BASE_URL}/login?subscription=cancel`;

  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Creating Stripe checkout session...');
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Success URL:', successUrl);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Cancel URL:', cancelUrl);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] User email:', user.email);

  try {
    const session = await stripeClient.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: env.STRIPE_PRO_PRICE_ID,
        quantity: 1,
      },
    ],
    customer_email: user.email,
    metadata: {
      user_id: String(user.user_id),
      plan: 'pro',
    },
    subscription_data: {
      metadata: {
        user_id: String(user.user_id),
        plan: 'pro',
      },
    },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // eslint-disable-next-line no-console
    console.log('[createProSubscriptionCheckoutSession] ✅ Session created:', session.id);
    return {
      url: session.url,
    };
  } catch (stripeError) {
    // eslint-disable-next-line no-console
    console.error('[createProSubscriptionCheckoutSession] ❌ Stripe error:', stripeError.type, stripeError.message);
    // eslint-disable-next-line no-console
    console.error('[createProSubscriptionCheckoutSession] Stripe error details:', stripeError);
    
    // Créer une erreur avec le statusCode approprié
    const error = new Error(stripeError.message || 'Erreur lors de la création de la session Stripe');
    error.statusCode = stripeError.statusCode || 400;
    error.type = stripeError.type;
    throw error;
  }
};

module.exports = {
  createProSubscriptionCheckoutSession,
};



