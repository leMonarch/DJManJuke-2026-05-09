const { pool } = require('../db/pool');

const PRIORITY_MIN_PRICE = 0.5;
const PRIORITY_INCREMENT = 0.25;

const roundToIncrement = (value) => Math.round(value / PRIORITY_INCREMENT) * PRIORITY_INCREMENT;

const normalizeAmount = (amount) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed < PRIORITY_MIN_PRICE) {
    return PRIORITY_MIN_PRICE;
  }
  const rounded = roundToIncrement(parsed);
  return Math.max(rounded, PRIORITY_MIN_PRICE);
};

const serializeInvestment = (row) => {
  if (!row) return null;
  return {
    ...row,
    amount_total: Number(row.amount_total),
    amount_remaining: Number(row.amount_remaining),
    passive_share: Number(row.passive_share),
    passive_earned: Number(row.passive_earned),
  };
};

const createInvestment = async ({ songId, userId, amount }) => {
  const normalizedAmount = normalizeAmount(amount);
  if (!songId || !userId) {
    const error = new Error('songId and userId are required');
    error.statusCode = 400;
    throw error;
  }

  const [result] = await pool.query(
    `INSERT INTO song_investments (song_id, user_id, amount_total, amount_remaining)
     VALUES (?, ?, ?, ?)`,
    [songId, userId, normalizedAmount, normalizedAmount],
  );

  return getInvestmentById(result.insertId);
};

const getInvestmentById = async (id) => {
  const [rows] = await pool.query(
    `SELECT si.*, u.username
     FROM song_investments si
     JOIN users u ON u.user_id = si.user_id
     WHERE si.id = ?`,
    [id],
  );
  return serializeInvestment(rows[0]);
};

const listInvestmentsForSong = async (songId) => {
  const [rows] = await pool.query(
    `SELECT si.*, u.username
     FROM song_investments si
     JOIN users u ON u.user_id = si.user_id
     WHERE si.song_id = ?
     ORDER BY si.created_at ASC, si.id ASC`,
    [songId],
  );
  return rows.map(serializeInvestment);
};

const listInvestmentsForSongs = async (songIds = []) => {
  if (!songIds.length) {
    return new Map();
  }
  const [rows] = await pool.query(
    `SELECT si.*, u.username
     FROM song_investments si
     JOIN users u ON u.user_id = si.user_id
     WHERE si.song_id IN (?)
     ORDER BY si.song_id ASC, si.created_at ASC, si.id ASC`,
    [songIds],
  );

  const grouped = new Map();
  rows.forEach((row) => {
    if (!grouped.has(row.song_id)) {
      grouped.set(row.song_id, []);
    }
    grouped.get(row.song_id).push(serializeInvestment(row));
  });
  return grouped;
};

const listInvestmentsForUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT si.*, s.title, s.artist
     FROM song_investments si
     JOIN songs s ON s.id = si.song_id
     WHERE si.user_id = ?
     ORDER BY si.created_at DESC`,
    [userId],
  );
  return rows.map((row) => ({
    ...serializeInvestment(row),
    title: row.title,
    artist: row.artist,
  }));
};

const updateInvestment = async (id, fields = {}) => {
  const columns = [];
  const values = [];
  Object.entries(fields).forEach(([key, value]) => {
    columns.push(`${key} = ?`);
    values.push(value);
  });
  if (!columns.length) {
    return getInvestmentById(id);
  }
  values.push(id);
  await pool.query(`UPDATE song_investments SET ${columns.join(', ')} WHERE id = ?`, values);
  return getInvestmentById(id);
};

const consumeInvestment = async (songId, amount) => {
  let remainingToConsume = normalizeAmount(amount);
  const [rows] = await pool.query(
    `SELECT *
     FROM song_investments
     WHERE song_id = ? AND amount_remaining > 0
     ORDER BY created_at ASC, id ASC`,
    [songId],
  );

  for (const investment of rows) {
    if (remainingToConsume <= 0) {
      break;
    }
    const deduction = Math.min(remainingToConsume, Number(investment.amount_remaining));
    const newRemaining = Number(investment.amount_remaining) - deduction;
    await pool.query(
      `UPDATE song_investments
       SET amount_remaining = ?, passive_share = CASE WHEN ? <= 0 THEN 1 ELSE passive_share END
       WHERE id = ?`,
      [newRemaining, newRemaining, investment.id],
    );
    remainingToConsume = Number((remainingToConsume - deduction).toFixed(2));
  }

  return listInvestmentsForSong(songId);
};

const recordPassiveRevenue = async (songId, amount) => {
  const normalizedAmount = normalizeAmount(amount);
  const passiveShare = normalizedAmount * 0.2;
  // Récupérer les investissements avec leur montant total investi pour calculer les ratios
  const [rows] = await pool.query(
    `SELECT id, user_id, amount_total
     FROM song_investments
     WHERE song_id = ? AND passive_share = 1`,
    [songId],
  );
  if (!rows.length) {
    return { investors: [], sharePerInvestor: 0 };
  }
  
  // Calculer le total investi pour cette chanson
  const totalInvested = rows.reduce((sum, row) => sum + Number(row.amount_total), 0);
  
  if (totalInvested <= 0) {
    return { investors: [], sharePerInvestor: 0 };
  }
  
  // Calculer et distribuer les parts proportionnellement au montant investi
  const investorShares = [];
  await Promise.all(
    rows.map(async (row) => {
      // Calculer le ratio de cet investisseur
      const investmentRatio = Number(row.amount_total) / totalInvested;
      // Calculer sa part proportionnelle
      const investorShare = Number((passiveShare * investmentRatio).toFixed(2));
      
      investorShares.push({
        userId: row.user_id,
        share: investorShare,
      });
      
      // Mettre à jour les gains passifs de cet investisseur
      await pool.query(
        `UPDATE song_investments
         SET passive_earned = passive_earned + ?
         WHERE id = ?`,
        [investorShare, row.id],
      );
    }),
  );
  
  return { 
    investors: rows.map((row) => row.user_id), 
    sharePerInvestor: investorShares.length > 0 ? investorShares[0].share : 0,
    investorShares, // Retourner les parts individuelles pour debug/transparence
  };
};

const isSongGolden = async (songId) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM song_investments
     WHERE song_id = ?`,
    [songId],
  );
  return rows[0]?.count > 0;
};

/**
 * Vérifie si l'utilisateur a un investissement restant suffisant (≥ 0.50$) pour cette chanson
 * @param {number} songId
 * @param {number} userId
 * @returns {Promise<{hasEnough: boolean, totalRemaining: number, investmentIds: number[]}>}
 */
const getUserRemainingInvestment = async (songId, userId) => {
  const [rows] = await pool.query(
    `SELECT id, amount_remaining
     FROM song_investments
     WHERE song_id = ? AND user_id = ? AND amount_remaining > 0
     ORDER BY created_at ASC, id ASC`,
    [songId, userId],
  );
  const totalRemaining = rows.reduce((sum, row) => sum + Number(row.amount_remaining), 0);
  return {
    hasEnough: totalRemaining >= 0.5,
    totalRemaining,
    investmentIds: rows.map((row) => row.id),
    investments: rows,
  };
};

/**
 * Vérifie s'il existe un investissement restant suffisant (≥ 0.50$) pour cette chanson (peu importe qui l'a créé)
 * @param {number} songId
 * @returns {Promise<{hasEnough: boolean, totalRemaining: number, investments: Array}>}
 */
const getAnyRemainingInvestment = async (songId) => {
  const [rows] = await pool.query(
    `SELECT id, user_id, amount_remaining
     FROM song_investments
     WHERE song_id = ? AND amount_remaining > 0
     ORDER BY created_at ASC, id ASC`,
    [songId],
  );
  const totalRemaining = rows.reduce((sum, row) => sum + Number(row.amount_remaining), 0);
  return {
    hasEnough: totalRemaining >= 0.5,
    totalRemaining,
    investments: rows,
  };
};

/**
 * Déduit un montant de l'investissement restant de l'utilisateur pour une chanson
 * @param {number} songId
 * @param {number} userId
 * @param {number} amount
 * @returns {Promise<{deducted: number, investmentIds: number[]}>}
 */
const deductFromUserRemainingInvestment = async (songId, userId, amount) => {
  const normalizedAmount = normalizeAmount(amount);
  const { investments } = await getUserRemainingInvestment(songId, userId);
  
  if (!investments.length) {
    return { deducted: 0, investmentIds: [] };
  }

  let remainingToDeduct = normalizedAmount;
  const affectedInvestmentIds = [];

  for (const investment of investments) {
    if (remainingToDeduct <= 0) {
      break;
    }
    const deduction = Math.min(remainingToDeduct, Number(investment.amount_remaining));
    const newRemaining = Number(investment.amount_remaining) - deduction;
    await pool.query(
      `UPDATE song_investments
       SET amount_remaining = ?, passive_share = CASE WHEN ? <= 0 THEN 1 ELSE passive_share END
       WHERE id = ?`,
      [newRemaining, newRemaining, investment.id],
    );
    affectedInvestmentIds.push(investment.id);
    remainingToDeduct = Number((remainingToDeduct - deduction).toFixed(2));
  }

  return {
    deducted: normalizedAmount - remainingToDeduct,
    investmentIds: affectedInvestmentIds,
  };
};

/**
 * Déduit un montant du premier investissement restant disponible pour une chanson
 * (peu importe qui l'a créé) et retourne l'investisseur original
 * @param {number} songId
 * @param {number} amount
 * @returns {Promise<{deducted: number, investorUserId: number | null, investmentIds: number[]}>}
 */
const deductFromAnyRemainingInvestment = async (songId, amount) => {
  const normalizedAmount = normalizeAmount(amount);
  const { investments } = await getAnyRemainingInvestment(songId);
  
  if (!investments.length) {
    return { deducted: 0, investorUserId: null, investmentIds: [] };
  }

  let remainingToDeduct = normalizedAmount;
  const affectedInvestmentIds = [];
  let investorUserId = null; // L'investisseur original (propriétaire de l'investissement)

  for (const investment of investments) {
    if (remainingToDeduct <= 0) {
      break;
    }
    // Prendre l'investisseur du premier investissement utilisé
    if (investorUserId === null) {
      investorUserId = Number(investment.user_id);
    }
    const deduction = Math.min(remainingToDeduct, Number(investment.amount_remaining));
    const newRemaining = Number(investment.amount_remaining) - deduction;
    await pool.query(
      `UPDATE song_investments
       SET amount_remaining = ?, passive_share = CASE WHEN ? <= 0 THEN 1 ELSE passive_share END
       WHERE id = ?`,
      [newRemaining, newRemaining, investment.id],
    );
    affectedInvestmentIds.push(investment.id);
    remainingToDeduct = Number((remainingToDeduct - deduction).toFixed(2));
  }

  return {
    deducted: normalizedAmount - remainingToDeduct,
    investorUserId,
    investmentIds: affectedInvestmentIds,
  };
};

module.exports = {
  createInvestment,
  getInvestmentById,
  listInvestmentsForSong,
  listInvestmentsForSongs,
  listInvestmentsForUser,
  updateInvestment,
  consumeInvestment,
  recordPassiveRevenue,
  isSongGolden,
  normalizeAmount,
  getUserRemainingInvestment,
  deductFromUserRemainingInvestment,
  getAnyRemainingInvestment,
  deductFromAnyRemainingInvestment,
};


