const stripe = require('stripe');
const { env } = require('../config/env');

// eslint-disable-next-line no-console
console.log('[Stripe] STRIPE_SECRET_KEY configured:', !!env.STRIPE_SECRET_KEY);
// eslint-disable-next-line no-console
console.log('[Stripe] STRIPE_SECRET_KEY length:', env.STRIPE_SECRET_KEY ? env.STRIPE_SECRET_KEY.length : 0);
// eslint-disable-next-line no-console
console.log('[Stripe] STRIPE_SECRET_KEY starts with sk_:', env.STRIPE_SECRET_KEY ? env.STRIPE_SECRET_KEY.startsWith('sk_') : false);

const stripeClient = env.STRIPE_SECRET_KEY ? stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

module.exports = {
  stripeClient,
};

