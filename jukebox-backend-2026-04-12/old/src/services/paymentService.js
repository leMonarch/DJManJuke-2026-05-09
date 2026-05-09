const { pool } = require('../db/pool');
const { jukeboxService } = require('./jukeboxService');
const { songService } = require('./songService');
const { stripeClient } = require('../lib/stripe');
const { env } = require('../config/env');
const { resolveRevenueParticipants, recordTrackPurchaseSplit } = require('./revenueService');
const { calculateUserBalances } = require('./revenueService');
const { isSongGolden, getAnyRemainingInvestment, deductFromAnyRemainingInvestment } = require('./investmentService');
const {
  hasClaimedGoldenReward,
  markGoldenRewardClaimed,
} = require('./goldenRewardService');
const { createPriorityReservation } = require('./balanceReservationService');

let cachedAnonymousPayerId = null;

const resolveAnonymousPayerUserId = async () => {
  if (cachedAnonymousPayerId != null) {
    return cachedAnonymousPayerId;
  }
  const email = env.ANONYMOUS_PAYER_EMAIL;
  if (!email) {
    cachedAnonymousPayerId = null;
    return null;
  }
  const [[row]] = await pool.query(
    'SELECT user_id FROM users WHERE email = ? LIMIT 1',
    [email],
  );
  cachedAnonymousPayerId = row?.user_id ?? null;
  return cachedAnonymousPayerId;
};

const createPriorityPaymentInternal = async ({
  songId,
  amount,
  slug,
  currentSongId,
  effectiveUserId,
  // When true, we still allow priority payments on golden songs even if the
  // user has already claimed the Investit bonus. This is used for guests so
  // they can re-prioritize without being blocked.
  skipGoldenCheck = false,
}) => {
  if (!songId) {
    const error = new Error('songId is required');
    error.statusCode = 400;
    throw error;
  }

  if (!stripeClient) {
    const error = new Error('Stripe is not configured for priority payments');
    error.statusCode = 500;
    throw error;
  }

  const parsedAmount = Number(amount);
  const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0.5 ? parsedAmount : 0.5;
  const targetSlug = slug || 'default';
  const currentSongMetadata = currentSongId != null ? Number(currentSongId) : null;

  const golden = await isSongGolden(songId);
  if (!skipGoldenCheck && golden && effectiveUserId) {
    const alreadyClaimed = await hasClaimedGoldenReward({ songId, userId: effectiveUserId });
    if (alreadyClaimed) {
      const error = new Error(
        'Tu as déjà utilisé le bonus Investit sur cette chanson. Tu peux toujours la prioriser, mais sans bonus supplémentaire.',
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: Math.round(normalizedAmount * 100),
    // On laisse la devise configurable, mais Stripe Link/Payment Element
    // fonctionnera avec la devise par défaut du compte.
    currency: env.STRIPE_DEFAULT_CURRENCY || 'cad',
    metadata: {
      type: 'priority',
      songId,
      userId: effectiveUserId ?? null,
      slug: targetSlug,
      priorityAmount: normalizedAmount,
      currentSongId: currentSongMetadata,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
};

const createPriorityPayment = async ({ songId, amount, slug, currentSongId, user }) => {
  if (!user || !user.user_id) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  return createPriorityPaymentInternal({
    songId,
    amount,
    slug,
    currentSongId,
    effectiveUserId: user.user_id,
    skipGoldenCheck: false,
  });
};

const createGuestPriorityPayment = async ({ songId, amount, slug, currentSongId }) => {
  const proxyUserId = await resolveAnonymousPayerUserId();
  return createPriorityPaymentInternal({
    songId,
    amount,
    slug,
    currentSongId,
    effectiveUserId: proxyUserId,
    // Les invités peuvent toujours prioriser une chanson dorée plusieurs fois.
    // Ils conservent le même proxyUserId pour le partage des revenus,
    // mais on ne les bloque pas après le premier bonus Investit.
    skipGoldenCheck: true,
  });
};

const createPriorityPaymentFromBalance = async ({ songId, amount, slug, currentSongId, user }) => {
  if (!user || !user.user_id) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  if (!songId) {
    const error = new Error('songId is required');
    error.statusCode = 400;
    throw error;
  }

  const parsedAmount = Number(amount);
  const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0.5 ? parsedAmount : 0.5;
  const targetSlug = slug || 'default';

  // Récupère le jukebox afin de lier la réservation à un contexte précis.
  const jukebox = await jukeboxService.getJukeboxBySlug(targetSlug);

  // Vérifier si l'utilisateur est propriétaire du jukebox ET a un plan "pro"
  const isOwner = jukebox.owner_user_id === user.user_id;
  const isPro = user.plan === 'pro';
  const isOwnerPro = isOwner && isPro;

  // Si le propriétaire est "pro", priorisation gratuite (pas de réservation de solde)
  if (isOwnerPro) {
    const playlist = await jukeboxService.prioritizeSong(
      targetSlug,
      songId,
      normalizedAmount,
      currentSongId,
      user.user_id,
      false, // paidFromRemainingInvestment
      null, // investorUserId
      true, // isFree - marquer comme gratuit pour ne pas l'inclure dans le "Total misé"
    );

    const golden = await isSongGolden(songId);
    if (golden) {
      await markGoldenRewardClaimed({ songId, userId: user.user_id });
    }

    return {
      paymentIntent: null,
      playlist,
    };
  }

  // Pour les non-propriétaires ou propriétaires "free", logique normale avec paiement
  // Vérifier s'il existe un investissement restant suffisant (≥ 0.50$) pour cette chanson
  // (peu importe qui l'a créé - l'investisseur original sera le payeur)
  const remainingInvestment = await getAnyRemainingInvestment(songId);
  let paidFromRemainingInvestment = false;
  let investorUserId = null; // L'investisseur original (propriétaire de l'investissement)

  if (remainingInvestment.hasEnough && normalizedAmount === 0.5) {
    // Cas spécial : utiliser un investissement restant disponible
    // L'investisseur original est le payeur, le current user recevra le gain de 0.10$
    const deductionResult = await deductFromAnyRemainingInvestment(songId, normalizedAmount);
    investorUserId = deductionResult.investorUserId;
    paidFromRemainingInvestment = true;
  } else {
    // Cas normal : vérifier le solde et créer une réservation
    const balances = await calculateUserBalances(user.user_id);
    if (normalizedAmount > balances.available + 0.0001) {
      const error = new Error("Solde insuffisant pour utiliser vos gains.");
      error.statusCode = 400;
      throw error;
    }

    // Au lieu de débiter immédiatement et définitivement le solde,
    // on crée une "réservation" en statut pending. Le montant est
    // bloqué (calculateUserBalances le considère comme retenu via payouts),
    // mais il ne sera définitivement consommé qu'à la fin de la lecture
    // (completeSong), lorsque la priorité aura réellement été utilisée.
    await createPriorityReservation({
      userId: user.user_id,
      jukeboxId: jukebox.id,
      songId,
      amount: normalizedAmount,
      currency: env.STRIPE_DEFAULT_CURRENCY || 'cad',
    });
  }

  const playlist = await jukeboxService.prioritizeSong(
    targetSlug,
    songId,
    normalizedAmount,
    currentSongId,
    user.user_id,
    paidFromRemainingInvestment,
    investorUserId, // L'investisseur original (propriétaire de l'investissement)
  );

  const golden = await isSongGolden(songId);
  if (golden) {
    await markGoldenRewardClaimed({ songId, userId: user.user_id });
  }

  return {
    paymentIntent: null,
    playlist,
  };
};

const confirmPriorityPayment = async ({ paymentIntentId, user }) => {
  if (!stripeClient) {
    const error = new Error('Stripe is not configured');
    error.statusCode = 500;
    throw error;
  }

  if (!paymentIntentId) {
    const error = new Error('paymentIntentId is required');
    error.statusCode = 400;
    throw error;
  }

  const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    const error = new Error('PaymentIntent not found');
    error.statusCode = 404;
    throw error;
  }

  if (paymentIntent.status !== 'succeeded') {
    const error = new Error('PaymentIntent not succeeded');
    error.statusCode = 400;
    throw error;
  }

  const metadata = paymentIntent.metadata || {};

  if (metadata.type !== 'priority' || !metadata.songId || !metadata.priorityAmount || !metadata.slug) {
    const error = new Error('Invalid PaymentIntent metadata for priority payment');
    error.statusCode = 400;
    throw error;
  }

  const songId = Number(metadata.songId);
  const slug = metadata.slug || 'default';
  const amount = Number(metadata.priorityAmount);
  const currentSongId = metadata.currentSongId != null ? Number(metadata.currentSongId) : null;
  const metadataUserId = metadata.userId != null ? Number(metadata.userId) : null;
  const effectiveUserId = user?.user_id ?? metadataUserId ?? null;

  const playlist = await jukeboxService.prioritizeSong(slug, songId, amount, currentSongId, effectiveUserId);

  const golden = await isSongGolden(songId);
  if (golden && effectiveUserId) {
    await markGoldenRewardClaimed({ songId, userId: effectiveUserId });
  }

  return {
    playlist,
  };
};

const createBalanceTopUpIntent = async ({ amount, user }) => {
  if (!stripeClient) {
    const error = new Error('Stripe is not configured');
    error.statusCode = 500;
    throw error;
  }

  if (!user || !user.user_id) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  const parsedAmount = Number(amount);
  const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount >= 1 ? parsedAmount : 1;

  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: Math.round(normalizedAmount * 100),
    currency: env.STRIPE_DEFAULT_CURRENCY || 'cad',
    metadata: {
      type: 'balance_topup',
      userId: user.user_id,
      topupAmount: normalizedAmount,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
};

const confirmBalanceTopUp = async ({ paymentIntentId, user }) => {
  if (!stripeClient) {
    const error = new Error('Stripe is not configured');
    error.statusCode = 500;
    throw error;
  }

  if (!paymentIntentId) {
    const error = new Error('paymentIntentId is required');
    error.statusCode = 400;
    throw error;
  }

  const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    const error = new Error('PaymentIntent not found');
    error.statusCode = 404;
    throw error;
  }

  if (paymentIntent.status !== 'succeeded') {
    const error = new Error('PaymentIntent not succeeded');
    error.statusCode = 400;
    throw error;
  }

  const metadata = paymentIntent.metadata || {};
  if (metadata.type !== 'balance_topup') {
    const error = new Error('Invalid PaymentIntent metadata for balance top-up');
    error.statusCode = 400;
    throw error;
  }

  const metadataUserId = metadata.userId != null ? Number(metadata.userId) : null;
  const effectiveUserId = user?.user_id ?? metadataUserId ?? null;

  if (!effectiveUserId) {
    const error = new Error('Unable to resolve user for balance top-up');
    error.statusCode = 400;
    throw error;
  }

  const amount = Number(
    ((paymentIntent.amount_received ?? paymentIntent.amount ?? 0) / 100).toFixed(2),
  );

  // On crédite le solde interne en enregistrant un "payout" négatif déjà payé.
  await pool.query(
    `INSERT INTO payouts (user_id, amount, currency, status, stripe_transfer_id, stripe_payout_id, failure_reason, requested_at, processed_at)
     VALUES (?, ?, ?, 'paid', NULL, NULL, NULL, NOW(), NOW())`,
    [effectiveUserId, -amount, env.STRIPE_DEFAULT_CURRENCY || 'cad'],
  );

  return {
    topupAmount: amount,
  };
};

const processWebhook = async () => {
  // Webhook placeholder: the actual revenue split occurs at playback completion.
};

const createTrackPurchaseFromBalance = async ({ songId, slug, user }) => {
  if (!user || !user.user_id) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  if (!songId) {
    const error = new Error('songId is required');
    error.statusCode = 400;
    throw error;
  }

  const normalizedAmount = 1;
  const targetSlug = slug || 'default';

  const balances = await calculateUserBalances(user.user_id);
  if (normalizedAmount > balances.available + 0.0001) {
    const error = new Error("Solde insuffisant pour acheter ce titre avec vos gains.");
    error.statusCode = 400;
    throw error;
  }

  // Débit du solde en enregistrant un "payout" interne déjà payé
  // Utilise un montant positif pour augmenter withheld et réduire available
  await pool.query(
    `INSERT INTO payouts (user_id, amount, currency, status, stripe_transfer_id, stripe_payout_id, failure_reason, requested_at, processed_at)
     VALUES (?, ?, ?, 'paid', NULL, NULL, NULL, NOW(), NOW())`,
    [user.user_id, normalizedAmount, env.STRIPE_DEFAULT_CURRENCY || 'cad'],
  );

  // Enregistre un paiement interne afin d'appliquer le partage des revenus
  const participants = await resolveRevenueParticipants({ songId, slug: targetSlug });
  const internalPaymentId = `balance_track_${songId}_${Date.now()}`;

  const [paymentResult] = await pool.query(
    `INSERT INTO payments (stripe_payment_id, current_user_id, jukebox_user_id, artist_user_id, promoter_user_id, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      internalPaymentId,
      user.user_id,
      participants.jukeboxOwnerId ?? null,
      participants.songOwnerId ?? null,
      null,
      normalizedAmount,
    ],
  );
  const paymentId = paymentResult.insertId;

  await recordTrackPurchaseSplit({
    paymentId,
    amount: normalizedAmount,
    songOwnerId: participants.songOwnerId ?? null,
    jukeboxOwnerId: participants.jukeboxOwnerId ?? null,
    platformUserId: participants.platformUserId ?? null,
  });

  return {
    paymentId,
  };
};

const createTrackPurchaseIntent = async ({ songId, slug, user }) => {
  if (!stripeClient) {
    const error = new Error('Stripe is not configured');
    error.statusCode = 500;
    throw error;
  }

  if (!songId) {
    const error = new Error('songId is required');
    error.statusCode = 400;
    throw error;
  }

  // On autorise l’achat de n’importe quel titre, sans vérifier la propriété.
  const song = await songService.getSongById(songId);

  const currency = env.STRIPE_DEFAULT_CURRENCY || 'cad';

  const paymentIntent = await stripeClient.paymentIntents.create({
    amount: 100,
    currency,
    metadata: {
      type: 'track_purchase',
      songId: song.id,
      userId: user?.user_id ?? null,
      slug: slug || '',
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
};

const createGuestTrackPurchaseIntent = async ({ songId, slug }) => {
  const proxyUserId = await resolveAnonymousPayerUserId();
  const proxyUser = proxyUserId ? { user_id: proxyUserId } : null;
  return createTrackPurchaseIntent({ songId, slug, user: proxyUser });
};

const confirmTrackPurchase = async ({ paymentIntentId, user }) => {
  if (!stripeClient) {
    const error = new Error('Stripe is not configured');
    error.statusCode = 500;
    throw error;
  }

  if (!paymentIntentId) {
    const error = new Error('paymentIntentId is required');
    error.statusCode = 400;
    throw error;
  }

  const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

  if (!paymentIntent) {
    const error = new Error('PaymentIntent not found');
    error.statusCode = 404;
    throw error;
  }

  if (paymentIntent.status !== 'succeeded') {
    const error = new Error('PaymentIntent not succeeded');
    error.statusCode = 400;
    throw error;
  }

  const metadata = paymentIntent.metadata || {};
  if (metadata.type !== 'track_purchase' || !metadata.songId) {
    const error = new Error('Invalid PaymentIntent metadata');
    error.statusCode = 400;
    throw error;
  }

  const songId = Number(metadata.songId);
  const slug = metadata.slug || null;

  const [[existing]] = await pool.query('SELECT id FROM payments WHERE stripe_payment_id = ? LIMIT 1', [
    paymentIntent.id,
  ]);
  if (existing) {
    return { paymentId: existing.id, alreadyProcessed: true };
  }

  const amount = Number(
    ((paymentIntent.amount_received ?? paymentIntent.amount ?? 0) / 100).toFixed(2),
  );

  const participants = await resolveRevenueParticipants({ songId, slug });

  const [paymentResult] = await pool.query(
    `INSERT INTO payments (stripe_payment_id, current_user_id, jukebox_user_id, artist_user_id, promoter_user_id, amount)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      paymentIntent.id,
      user?.user_id ?? null,
      participants.jukeboxOwnerId ?? null,
      participants.songOwnerId ?? null,
      null,
      amount,
    ],
  );
  const paymentId = paymentResult.insertId;

  await recordTrackPurchaseSplit({
    paymentId,
    amount,
    songOwnerId: participants.songOwnerId ?? null,
    jukeboxOwnerId: participants.jukeboxOwnerId ?? null,
    platformUserId: participants.platformUserId ?? null,
  });

  return {
    paymentId,
    alreadyProcessed: false,
  };
};

const paymentService = {
  createPriorityPayment,
  createPriorityPaymentFromBalance,
  createBalanceTopUpIntent,
  confirmBalanceTopUp,
  createTrackPurchaseFromBalance,
  createTrackPurchaseIntent,
  confirmTrackPurchase,
  confirmPriorityPayment,
  processWebhook,
  createGuestPriorityPayment,
  createGuestTrackPurchaseIntent,
};

module.exports = { paymentService };

