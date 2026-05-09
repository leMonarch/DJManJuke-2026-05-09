const { pool } = require('../db/pool');

const MAX_FREE_CONTROLS_PER_DAY = 8;

const getUserPlan = async (userId) => {
  const [[row]] = await pool.query(
    `SELECT plan
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [userId],
  );
  return row?.plan ?? 'free';
};

/**
 * Vérifie si l'utilisateur peut effectuer une action de contrôle (skip/previous)
 * et met à jour le compteur pour la journée si nécessaire.
 *
 * - Pour le plan "pro", on autorise toujours l'action (le compteur sert au besoin pour des stats).
 * - Pour le plan "free", on bloque au-delà de MAX_FREE_CONTROLS_PER_DAY skip/previous cumulés.
 */
const checkAndIncrementControlUsage = async ({ userId, jukeboxId, type }) => {
  if (!userId || !jukeboxId || !type) {
    return;
  }

  const plan = await getUserPlan(userId);

  const [[usageRow]] = await pool.query(
    `SELECT id, skip_count, previous_count
     FROM jukebox_control_usage
     WHERE user_id = ? AND jukebox_id = ? AND usage_date = CURRENT_DATE
     LIMIT 1`,
    [userId, jukeboxId],
  );

  const currentSkip = Number(usageRow?.skip_count ?? 0);
  const currentPrev = Number(usageRow?.previous_count ?? 0);
  const total = currentSkip + currentPrev;

  if (plan === 'free' && total >= MAX_FREE_CONTROLS_PER_DAY) {
    const error = new Error(
      "Limite quotidienne de 8 actions 'suivant/précédent' atteinte pour le plan Free. Passe au plan Pro pour des contrôles illimités.",
    );
    error.statusCode = 429;
    throw error;
  }

  const newSkip = type === 'skip' ? currentSkip + 1 : currentSkip;
  const newPrev = type === 'previous' ? currentPrev + 1 : currentPrev;

  if (usageRow?.id) {
    await pool.query(
      `UPDATE jukebox_control_usage
       SET skip_count = ?, previous_count = ?
       WHERE id = ?`,
      [newSkip, newPrev, usageRow.id],
    );
  } else {
    await pool.query(
      `INSERT INTO jukebox_control_usage (user_id, jukebox_id, usage_date, skip_count, previous_count)
       VALUES (?, ?, CURRENT_DATE, ?, ?)`,
      [userId, jukeboxId, newSkip, newPrev],
    );
  }
};

module.exports = {
  checkAndIncrementControlUsage,
  MAX_FREE_CONTROLS_PER_DAY,
};



