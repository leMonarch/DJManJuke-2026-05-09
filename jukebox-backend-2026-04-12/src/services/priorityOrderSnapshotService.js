const { pool } = require('../db/pool');

/**
 * Crée un snapshot de l'ordre courant d'une chanson dans un jukebox
 * avant l'application d'une priorité. Si un snapshot existe déjà pour
 * ce couple (jukebox, chanson), il est conservé tel quel (on ne le crée pas).
 * Le snapshot doit être créé AVANT la première priorité pour capturer
 * la position initiale de la chanson.
 */
const createPriorityOrderSnapshot = async ({ jukeboxId, songId }) => {
  if (!jukeboxId || !songId) {
    return;
  }

  // Vérifier si un snapshot existe déjà
  const [[existingSnapshot]] = await pool.query(
    `SELECT id
     FROM priority_order_snapshots
     WHERE jukebox_id = ? AND song_id = ?
     LIMIT 1`,
    [jukeboxId, songId],
  );

  // Si un snapshot existe déjà, on ne le modifie pas
  if (existingSnapshot) {
    return;
  }

  // Sinon, créer un nouveau snapshot avec la position actuelle
  const [[row]] = await pool.query(
    `SELECT order_id
     FROM jukebox_songs
     WHERE jukebox_id = ? AND song_id = ?
     LIMIT 1`,
    [jukeboxId, songId],
  );

  if (!row) {
    return;
  }

  const originalOrderId = Number(row.order_id ?? 0);

  await pool.query(
    `INSERT INTO priority_order_snapshots (jukebox_id, song_id, original_order_id)
     VALUES (?, ?, ?)`,
    [jukeboxId, songId, originalOrderId],
  );
};

/**
 * Restaure l'ordre d'origine d'une chanson si un snapshot existe,
 * puis supprime ce snapshot.
 */
const restoreAndDeletePriorityOrderSnapshot = async ({ jukeboxId, songId }) => {
  if (!jukeboxId || !songId) {
    return false;
  }

  const [[row]] = await pool.query(
    `SELECT original_order_id
     FROM priority_order_snapshots
     WHERE jukebox_id = ? AND song_id = ?
     LIMIT 1`,
    [jukeboxId, songId],
  );

  if (!row) {
    return false;
  }

  const originalOrderId = Number(row.original_order_id ?? 0);

  await pool.query(
    `UPDATE jukebox_songs
     SET order_id = ?
     WHERE jukebox_id = ? AND song_id = ?`,
    [originalOrderId, jukeboxId, songId],
  );

  await pool.query(
    `DELETE FROM priority_order_snapshots
     WHERE jukebox_id = ? AND song_id = ?`,
    [jukeboxId, songId],
  );

  return true;
};

/**
 * Supprime simplement le snapshot (par exemple après completeSong),
 * sans modifier l'ordre courant.
 */
const clearPriorityOrderSnapshot = async ({ jukeboxId, songId }) => {
  if (!jukeboxId || !songId) {
    return;
  }
  await pool.query(
    `DELETE FROM priority_order_snapshots
     WHERE jukebox_id = ? AND song_id = ?`,
    [jukeboxId, songId],
  );
};

module.exports = {
  createPriorityOrderSnapshot,
  restoreAndDeletePriorityOrderSnapshot,
  clearPriorityOrderSnapshot,
};


