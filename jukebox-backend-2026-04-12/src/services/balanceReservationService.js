const { pool } = require('../db/pool');

/**
 * Crée une réservation de solde interne (gains) pour une priorité.
 * On crée à la fois :
 * - un payout en statut "pending" pour que calculateUserBalances
 *   considère ce montant comme réservé (non réutilisable),
 * - une entrée dans balance_reservations pour pouvoir la
 *   "consommer" ou l'annuler plus tard.
 */
const createPriorityReservation = async ({ userId, jukeboxId, songId, amount, currency }) => {
  if (!userId || !jukeboxId || !songId || !amount || amount <= 0) {
    return null;
  }

  const [payoutResult] = await pool.query(
    `INSERT INTO payouts (user_id, amount, currency, status, stripe_transfer_id, stripe_payout_id, failure_reason, requested_at, processed_at)
     VALUES (?, ?, ?, 'pending', NULL, NULL, NULL, NOW(), NULL)`,
    [userId, amount, currency],
  );

  const payoutId = payoutResult.insertId;

  await pool.query(
    `INSERT INTO balance_reservations (user_id, jukebox_id, song_id, payout_id, amount, type, status)
     VALUES (?, ?, ?, ?, ?, 'priority', 'pending')`,
    [userId, jukeboxId, songId, payoutId, amount],
  );

  return { payoutId };
};

/**
 * Consomme toutes les réservations de priorité en attente pour une chanson
 * donnée dans un jukebox. Appelé depuis completeSong lorsque la lecture
 * a effectivement été complétée.
 */
const consumePriorityReservationsForSong = async ({ jukeboxId, songId }) => {
  if (!jukeboxId || !songId) {
    return;
  }

  await pool.query(
    `UPDATE payouts p
     JOIN balance_reservations br ON br.payout_id = p.id
     SET
       p.status = 'paid',
       p.processed_at = COALESCE(p.processed_at, NOW()),
       br.status = 'consumed',
       br.consumed_at = COALESCE(br.consumed_at, NOW())
     WHERE br.jukebox_id = ? AND br.song_id = ? AND br.status = 'pending'`,
    [jukeboxId, songId],
  );
};

/**
 * Annule la dernière réservation de priorité "pending" d'un utilisateur
 * pour une chanson dans un jukebox. Le payout repasse en "failed" et
 * le solde redevient disponible.
 */
const cancelLatestPriorityReservationForUserOnSong = async ({ userId, jukeboxId, songId }) => {
  if (!userId || !jukeboxId || !songId) {
    return null;
  }

  const [rows] = await pool.query(
    `SELECT *
     FROM balance_reservations
     WHERE user_id = ? AND jukebox_id = ? AND song_id = ? AND type = 'priority' AND status = 'pending'
     ORDER BY id DESC
     LIMIT 1`,
    [userId, jukeboxId, songId],
  );

  if (!rows.length) {
    return null;
  }

  const reservation = rows[0];

  await pool.query(
    `UPDATE payouts p
     JOIN balance_reservations br ON br.payout_id = p.id
     SET
       br.status = 'cancelled',
       br.cancelled_at = COALESCE(br.cancelled_at, NOW()),
       p.status = 'failed',
       p.processed_at = COALESCE(p.processed_at, NOW()),
       p.failure_reason = COALESCE(p.failure_reason, 'cancelled_by_user')
     WHERE br.id = ?`,
    [reservation.id],
  );

  return {
    reservationId: reservation.id,
    amount: Number(reservation.amount ?? 0),
  };
};

module.exports = {
  createPriorityReservation,
  consumePriorityReservationsForSong,
  cancelLatestPriorityReservationForUserOnSong,
};


