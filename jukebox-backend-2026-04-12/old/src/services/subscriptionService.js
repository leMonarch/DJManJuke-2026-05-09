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

const createProSubscriptionCheckoutSession = async ({ userId, frontendUrl }) => {
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] ========================================');
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Starting, userId:', userId);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Stripe configured:', !!stripeClient);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] STRIPE_SECRET_KEY starts with:', env.STRIPE_SECRET_KEY ? env.STRIPE_SECRET_KEY.substring(0, 7) + '...' : 'Missing');
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] STRIPE_PRO_PRICE_ID:', env.STRIPE_PRO_PRICE_ID || 'MISSING');
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] STRIPE_PRO_PRICE_ID length:', env.STRIPE_PRO_PRICE_ID ? env.STRIPE_PRO_PRICE_ID.length : 0);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] APP_BASE_URL:', env.APP_BASE_URL);
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] CLIENT_URL:', env.CLIENT_URL);

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

  // Construire les URLs de succès et d'annulation
  // IMPORTANT: Les URLs doivent pointer vers le FRONTEND, pas le backend
  // Solution pour URLs Vercel dynamiques :
  // 1. Priorité: URL passée depuis le client (frontendUrl)
  // 2. Utiliser CLIENT_URL (doit être mis à jour à chaque déploiement Vercel)
  // 3. Utiliser APP_BASE_URL si c'est un domaine Vercel
  // 4. Fallback vers localhost pour le développement
  
  // Priorité 1: URL passée depuis le client (pour gérer les URLs Vercel dynamiques)
  let appBaseUrl = frontendUrl || env.CLIENT_URL || env.APP_BASE_URL || 'http://localhost:5173';
  
  if (frontendUrl) {
    // eslint-disable-next-line no-console
    console.log('[createProSubscriptionCheckoutSession] Using frontendUrl from request:', frontendUrl);
  }
  
  // Si APP_BASE_URL ou CLIENT_URL pointe vers le backend (djmanjuke.com), chercher dans CLIENT_ORIGINS
  if (appBaseUrl.includes('djmanjuke.com') && !appBaseUrl.includes('vercel')) {
    // eslint-disable-next-line no-console
    console.warn('[createProSubscriptionCheckoutSession] URL points to backend, searching in CLIENT_ORIGINS');
    // Chercher une URL Vercel dans CLIENT_ORIGINS
    const vercelUrl = env.CLIENT_ORIGINS?.find(origin => origin.includes('vercel.app'));
    if (vercelUrl) {
      appBaseUrl = vercelUrl;
      // eslint-disable-next-line no-console
      console.log('[createProSubscriptionCheckoutSession] Using Vercel URL from CLIENT_ORIGINS:', appBaseUrl);
    } else {
      // eslint-disable-next-line no-console
      console.warn('[createProSubscriptionCheckoutSession] No Vercel URL found in CLIENT_ORIGINS, using:', appBaseUrl);
    }
  }
  
  // S'assurer que l'URL se termine par / si nécessaire
  const baseUrl = appBaseUrl.endsWith('/') ? appBaseUrl.slice(0, -1) : appBaseUrl;
  
  const successUrl = `${baseUrl}/login?subscription=success`;
  const cancelUrl = `${baseUrl}/login?subscription=cancel`;
  
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Final URLs:', {
    baseUrl,
    successUrl,
    cancelUrl,
    userEmail: user.email,
  });

  try {
  // Valider que les URLs sont valides
  if (!successUrl.startsWith('http://') && !successUrl.startsWith('https://')) {
    const error = new Error(`Invalid success URL format: ${successUrl}`);
    error.statusCode = 400;
    error.details = { successUrl, cancelUrl, baseUrl };
    throw error;
  }
  if (!cancelUrl.startsWith('http://') && !cancelUrl.startsWith('https://')) {
    const error = new Error(`Invalid cancel URL format: ${cancelUrl}`);
    error.statusCode = 400;
    error.details = { successUrl, cancelUrl, baseUrl };
    throw error;
  }

  // Valider l'email
  if (!user.email || !user.email.includes('@')) {
    const error = new Error(`Invalid user email: ${user.email || 'missing'}`);
    error.statusCode = 400;
    error.details = { userId: user.user_id, email: user.email };
    throw error;
  }

  // Valider que STRIPE_PRO_PRICE_ID est valide (format Stripe)
  if (!env.STRIPE_PRO_PRICE_ID) {
    const error = new Error('STRIPE_PRO_PRICE_ID is not configured');
    error.statusCode = 500;
    error.details = { 
      message: 'The Stripe Pro Price ID is missing. Please configure STRIPE_PRO_PRICE_ID in your environment variables.',
      configured: false,
    };
    throw error;
  }
  
  if (!env.STRIPE_PRO_PRICE_ID.startsWith('price_')) {
    const error = new Error(`Invalid STRIPE_PRO_PRICE_ID format: ${env.STRIPE_PRO_PRICE_ID}. Must start with 'price_'`);
    error.statusCode = 400;
    error.details = { 
      provided: env.STRIPE_PRO_PRICE_ID,
      expectedFormat: 'price_XXXXX',
    };
    throw error;
  }
  
  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] ✅ STRIPE_PRO_PRICE_ID is valid format:', env.STRIPE_PRO_PRICE_ID);

  // eslint-disable-next-line no-console
  console.log('[createProSubscriptionCheckoutSession] Creating session with:', {
    price: env.STRIPE_PRO_PRICE_ID,
    email: user.email,
    userId: user.user_id,
    successUrl,
    cancelUrl,
    baseUrl,
    frontendUrl: frontendUrl || 'not provided',
    clientUrl: env.CLIENT_URL,
    appBaseUrl: env.APP_BASE_URL,
  });

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
    console.error('[createProSubscriptionCheckoutSession] ❌ Stripe error type:', stripeError.type);
    // eslint-disable-next-line no-console
    console.error('[createProSubscriptionCheckoutSession] ❌ Stripe error message:', stripeError.message);
    // eslint-disable-next-line no-console
    console.error('[createProSubscriptionCheckoutSession] ❌ Stripe error code:', stripeError.code);
    // eslint-disable-next-line no-console
    console.error('[createProSubscriptionCheckoutSession] ❌ Stripe error param:', stripeError.param);
    // eslint-disable-next-line no-console
    console.error('[createProSubscriptionCheckoutSession] ❌ Stripe error details:', JSON.stringify(stripeError, null, 2));
    
    // Créer une erreur avec le statusCode approprié
    const error = new Error(stripeError.message || 'Erreur lors de la création de la session Stripe');
    error.statusCode = stripeError.statusCode || 400;
    error.type = stripeError.type;
    error.code = stripeError.code;
    error.param = stripeError.param;
    error.details = {
      type: stripeError.type,
      code: stripeError.code,
      param: stripeError.param,
      message: stripeError.message,
    };
    throw error;
  }
};

module.exports = {
  createProSubscriptionCheckoutSession,
};



