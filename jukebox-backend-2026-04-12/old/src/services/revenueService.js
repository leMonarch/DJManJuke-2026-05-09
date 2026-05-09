const { pool } = require('../db/pool');
const { env } = require('../config/env');
const { stripeClient } = require('../lib/stripe');
const { syncStripeAccountState } = require('./stripeConnectService');

const SHARE_ROLES = {
  SONG_OWNER: 'song_owner',
  INVESTOR: 'investor',
  JUKEBOX_OWNER: 'jukebox_owner',
  PAYER: 'payer',
  PLATFORM: 'platform',
};

const insertRevenueShare = async ({ paymentId, userId = null, role, amount }) => {
  await pool.query(
    `INSERT INTO revenue_shares (payment_id, user_id, role, amount)
     VALUES (?, ?, ?, ?)`,
    [paymentId, userId, role, amount],
  );
};

const resolveRevenueParticipants = async ({ songId, slug }) => {
  const [[songRow]] = await pool.query('SELECT user_id FROM songs WHERE id = ?', [songId]);

  const [[jukeboxRow]] = await pool.query(
    `SELECT owner_user_id
     FROM jukeboxes
     WHERE slug = ?
     LIMIT 1`,
    [slug],
  );

  const [[platformRow]] = await pool.query(
    `SELECT u.user_id
     FROM users u
     WHERE u.email = ?
     LIMIT 1`,
    [env.PLATFORM_USER_EMAIL],
  );

  return {
    songOwnerId: songRow?.user_id ?? null,
    jukeboxOwnerId: jukeboxRow?.owner_user_id ?? null,
    platformUserId: platformRow?.user_id ?? null,
  };
};

const recordRevenueSplit = async ({
  paymentId,
  amount,
  songId,
  songOwnerId,
  jukeboxOwnerId,
  payerUserId,
  passiveInvestors = [],
  platformUserId = null,
}) => {
  const baseShareRaw = amount * 0.2;
  const baseShare = Number(baseShareRaw.toFixed(2));
  const operations = [];

  if (songOwnerId) {
    operations.push(
      insertRevenueShare({
        paymentId,
        userId: songOwnerId,
        role: SHARE_ROLES.SONG_OWNER,
        amount: baseShare,
      }),
    );
  }

  if (passiveInvestors.length) {
    // Si songId n'est pas fourni, utiliser la distribution égale (fallback)
    if (!songId) {
      const investorPerUser = Number((baseShare / passiveInvestors.length).toFixed(2));
      passiveInvestors.forEach((investorId) => {
        operations.push(
          insertRevenueShare({
            paymentId,
            userId: investorId,
            role: SHARE_ROLES.INVESTOR,
            amount: investorPerUser,
          }),
        );
      });
    } else {
      // Récupérer les montants investis pour calculer les ratios proportionnels
      const [investmentRows] = await pool.query(
        `SELECT DISTINCT si.user_id, SUM(si.amount_total) AS total_invested
         FROM song_investments si
         WHERE si.song_id = ? AND si.user_id IN (?)
         GROUP BY si.user_id`,
        [songId, passiveInvestors],
      );
    
    if (investmentRows.length > 0) {
      // Calculer le total investi par tous les investisseurs
      const totalInvested = investmentRows.reduce(
        (sum, row) => sum + Number(row.total_invested || 0),
        0,
      );
      
      if (totalInvested > 0) {
        // Distribuer proportionnellement
        investmentRows.forEach((row) => {
          const investmentRatio = Number(row.total_invested) / totalInvested;
          const investorShare = Number((baseShare * investmentRatio).toFixed(2));
          
          operations.push(
            insertRevenueShare({
              paymentId,
              userId: row.user_id,
              role: SHARE_ROLES.INVESTOR,
              amount: investorShare,
            }),
          );
        });
      } else {
        // Fallback: distribution égale si pas de montants (ne devrait pas arriver)
        const investorPerUser = Number((baseShare / passiveInvestors.length).toFixed(2));
        passiveInvestors.forEach((investorId) => {
          operations.push(
            insertRevenueShare({
              paymentId,
              userId: investorId,
              role: SHARE_ROLES.INVESTOR,
              amount: investorPerUser,
            }),
          );
        });
      }
    } else {
      // Fallback: distribution égale si pas d'investissements trouvés
      const investorPerUser = Number((baseShare / passiveInvestors.length).toFixed(2));
      passiveInvestors.forEach((investorId) => {
        operations.push(
          insertRevenueShare({
            paymentId,
            userId: investorId,
            role: SHARE_ROLES.INVESTOR,
            amount: investorPerUser,
          }),
        );
      });
    }
    }
  }

  if (jukeboxOwnerId) {
    operations.push(
      insertRevenueShare({
        paymentId,
        userId: jukeboxOwnerId,
        role: SHARE_ROLES.JUKEBOX_OWNER,
        amount: baseShare,
      }),
    );
  }

  if (payerUserId) {
    operations.push(
      insertRevenueShare({
        paymentId,
        userId: payerUserId,
        role: SHARE_ROLES.PAYER,
        amount: baseShare,
      }),
    );
  }

  operations.push(
    insertRevenueShare({
      paymentId,
      userId: platformUserId,
      role: SHARE_ROLES.PLATFORM,
      amount: baseShare,
    }),
  );

  await Promise.all(operations);
};

const recordTrackPurchaseSplit = async ({
  paymentId,
  amount,
  songOwnerId,
  jukeboxOwnerId,
  platformUserId,
}) => {
  const rawArtist = amount * 0.5;
  const rawJukebox = amount * 0.33;
  const rawPlatform = amount - rawArtist - rawJukebox;

  const artistShare = Number(rawArtist.toFixed(2));
  const jukeboxShare = Number(rawJukebox.toFixed(2));
  const platformShare = Number((amount - artistShare - jukeboxShare).toFixed(2));

  const operations = [];

  if (songOwnerId && artistShare > 0) {
    operations.push(
      insertRevenueShare({
        paymentId,
        userId: songOwnerId,
        role: SHARE_ROLES.SONG_OWNER,
        amount: artistShare,
      }),
    );
  }

  if (jukeboxOwnerId && jukeboxShare > 0) {
    operations.push(
      insertRevenueShare({
        paymentId,
        userId: jukeboxOwnerId,
        role: SHARE_ROLES.JUKEBOX_OWNER,
        amount: jukeboxShare,
      }),
    );
  }

  if (platformUserId && platformShare > 0) {
    operations.push(
      insertRevenueShare({
        paymentId,
        userId: platformUserId,
        role: SHARE_ROLES.PLATFORM,
        amount: platformShare,
      }),
    );
  }

  await Promise.all(operations);
};

const listRevenueByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT rs.role, SUM(rs.amount) AS total
     FROM revenue_shares rs
     WHERE rs.user_id = ?
     GROUP BY rs.role`,
    [userId],
  );

  const totals = {
    song_owner: 0,
    investor: 0,
    jukebox_owner: 0,
    payer: 0,
    platform: 0,
  };
  rows.forEach((row) => {
    totals[row.role] = Number(row.total);
  });
  return totals;
};

const calculateUserBalances = async (userId, connection = null) => {
  const db = connection ?? pool;

  const [[earningsRow]] = await db.query(
    `SELECT COALESCE(SUM(rs.amount), 0) AS gross
     FROM revenue_shares rs
     WHERE rs.user_id = ?`,
    [userId],
  );

  const [[payoutRow]] = await db.query(
    `SELECT
        COALESCE(SUM(CASE WHEN status IN ('pending', 'processing', 'paid') AND amount > 0 THEN amount ELSE 0 END), 0) AS total_withheld,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'processing', 'paid') AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS total_credits,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN amount ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) AS failed
     FROM payouts
     WHERE user_id = ?`,
    [userId],
  );

  const gross = Number(earningsRow.gross ?? 0);
  const withheld = Number(payoutRow.total_withheld ?? 0);
  const credits = Number(payoutRow.total_credits ?? 0);
  const pending = Number(payoutRow.pending ?? 0);
  const withdrawn = Number(payoutRow.paid ?? 0);
  const failed = Number(payoutRow.failed ?? 0);

  // available = gains bruts - retenues (dépenses positives) + crédits (montants négatifs convertis en positifs)
  const available = Math.max(gross - withheld + credits, 0);

  return {
    available,
    pending,
    withdrawn,
    failed,
    lifetimeGross: gross,
    lifetimeNet: gross,
  };
};

const listPayoutsByUser = async (userId, { limit = 20 } = {}) => {
  const [rows] = await pool.query(
    `SELECT
        id,
        amount,
        currency,
        status,
        stripe_payout_id,
        stripe_transfer_id,
        failure_reason,
        requested_at,
        processed_at
     FROM payouts
     WHERE user_id = ?
     ORDER BY requested_at DESC
     LIMIT ?`,
    [userId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    stripePayoutId: row.stripe_payout_id,
    stripeTransferId: row.stripe_transfer_id,
    failureReason: row.failure_reason,
    requestedAt: row.requested_at,
    processedAt: row.processed_at,
  }));
};

const fetchStripeBalance = async (stripeAccountId) => {
  if (!stripeClient || !stripeAccountId) {
    return null;
  }
  try {
    const balance = await stripeClient.balance.retrieve({ stripeAccount: stripeAccountId });
    const toAmount = (entries = []) =>
      entries.reduce((acc, entry) => acc + (Number(entry.amount ?? 0) / 100), 0);
    return {
      available: toAmount(balance.available),
      pending: toAmount(balance.pending),
      livemode: balance.livemode,
      currency: balance.available?.[0]?.currency ?? env.STRIPE_DEFAULT_CURRENCY,
      raw: balance,
    };
  } catch (error) {
    return {
      error: error.message,
    };
  }
};

const getUserRevenueSummary = async (userId) => {
  const [[userRow]] = await pool.query(
    `SELECT
        stripe_account_id,
        stripe_onboarding_complete,
        stripe_payouts_enabled,
        plan
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );

  if (userRow?.stripe_account_id) {
    const account = await syncStripeAccountState({
      userId,
      stripeAccountId: userRow.stripe_account_id,
    });
    if (account) {
      userRow.stripe_onboarding_complete = account.details_submitted ? 1 : 0;
      userRow.stripe_payouts_enabled = account.payouts_enabled ? 1 : 0;
    }
  }

  const [totals, balances, payouts, stripeBalance] = await Promise.all([
    listRevenueByUser(userId),
    calculateUserBalances(userId),
    listPayoutsByUser(userId, { limit: 10 }),
    fetchStripeBalance(userRow?.stripe_account_id ?? null),
  ]);

  return {
    totals,
    balance: {
      available: balances.available,
      pending: balances.pending,
      withdrawn: balances.withdrawn,
      lifetimeGross: balances.lifetimeGross,
      lifetimeNet: balances.lifetimeNet,
      failed: balances.failed,
      currency: env.STRIPE_DEFAULT_CURRENCY,
    },
    payouts,
    stripe: {
      accountId: userRow?.stripe_account_id ?? null,
      onboardingComplete: Boolean(userRow?.stripe_onboarding_complete),
      payoutsEnabled: Boolean(userRow?.stripe_payouts_enabled),
      plan: userRow?.plan ?? null,
      balance: stripeBalance,
    },
    limits: {
      minPayoutAmount: env.MIN_PAYOUT_AMOUNT,
    },
  };
};

module.exports = {
  SHARE_ROLES,
  resolveRevenueParticipants,
  recordRevenueSplit,
  listRevenueByUser,
  calculateUserBalances,
  listPayoutsByUser,
  getUserRevenueSummary,
  recordTrackPurchaseSplit,
};


