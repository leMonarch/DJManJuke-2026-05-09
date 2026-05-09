const { pool } = require('../db/pool');
const { env } = require('../config/env');
const { stripeClient } = require('../lib/stripe');


const ensureStripeConfigured = () => {
  if (!stripeClient) {
    const error = new Error('Stripe n’est pas configuré côté serveur.');
    error.statusCode = 503;
    throw error;
  }
  return stripeClient;
};

const fetchUserStripeContext = async (userId) => {
  const [[userRow]] = await pool.query(
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

  if (!userRow) {
    return null;
  }

  const [[jukeboxRow]] = await pool.query(
    `SELECT slug
     FROM jukeboxes
     WHERE owner_user_id = ?
     ORDER BY id ASC
     LIMIT 1`,
    [userId],
  );

  return {
    user: userRow,
    jukeboxSlug: jukeboxRow?.slug ?? null,
  };
};

const updateUserStripeFlags = async (userId, account) => {
  if (!account) {
    return;
  }

  await pool.query(
    `UPDATE users
     SET stripe_account_id = ?, stripe_onboarding_complete = ?, stripe_payouts_enabled = ?
     WHERE user_id = ?`,
    [
      account.id,
      account.details_submitted ? 1 : 0,
      account.payouts_enabled ? 1 : 0,
      userId,
    ],
  );
};

const ensureStripeAccount = async (context) => {
  const client = ensureStripeConfigured();

  if (context.user.stripe_account_id) {
    const account = await client.accounts.retrieve(context.user.stripe_account_id);
    await updateUserStripeFlags(context.user.user_id, account);
    return account;
  }

  const account = await client.accounts.create({
    type: 'express',
    country: env.STRIPE_CONNECT_DEFAULT_COUNTRY,
    email: context.user.email,
    business_profile: {
      product_description: 'Transferts DJMan Jukebox',
      url: env.CLIENT_URL,
    },
    metadata: {
      platform: 'djman-mini',
      user_id: String(context.user.user_id),
      jukebox_slug: context.jukeboxSlug ?? '',
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await updateUserStripeFlags(context.user.user_id, account);
  return account;
};

const buildAdminBaseUrl = (slug) => {
  const base = env.APP_BASE_URL || env.CLIENT_URL;
  if (!base) {
    const error = new Error('APP_BASE_URL manquant côté serveur.');
    error.statusCode = 500;
    throw error;
  }
  const normalized = base.replace(/\/$/, '');
  new URL(normalized); // valide l’URL
  const basePath = slug ? `/${slug}/admin` : '/admin';
  return `${normalized}${basePath}`;
};

const createStripeOnboardingLink = async ({ userId }) => {
  const context = await fetchUserStripeContext(userId);
  if (!context) {
    const error = new Error('Utilisateur introuvable.');
    error.statusCode = 404;
    throw error;
  }

  const account = await ensureStripeAccount(context);
  const client = ensureStripeConfigured();

  const baseUrl = buildAdminBaseUrl(context.jukeboxSlug);
  const linkType = account.details_submitted && account.payouts_enabled ? 'account_update' : 'account_onboarding';

  const link = await client.accountLinks.create({
    account: account.id,
    refresh_url: `${baseUrl}?stripe=refresh`,
    return_url: `${baseUrl}?stripe=success`,
    type: linkType,
  });

  return {
    url: link.url,
    expiresAt: link.expires_at ? new Date(link.expires_at * 1000).toISOString() : null,
    accountId: account.id,
    onboardingComplete: account.details_submitted,
    payoutsEnabled: account.payouts_enabled,
  };
};

const syncStripeAccountState = async ({ userId, stripeAccountId }) => {
  if (!stripeAccountId || !stripeClient) {
    return null;
  }
  const account = await stripeClient.accounts.retrieve(stripeAccountId);
  await updateUserStripeFlags(userId, account);
  return account;
};

module.exports = {
  createStripeOnboardingLink,
  syncStripeAccountState,
};


