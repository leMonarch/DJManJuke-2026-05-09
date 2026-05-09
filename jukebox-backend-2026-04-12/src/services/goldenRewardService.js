const { pool } = require('../db/pool');

let tableEnsured = false;

const ensureTable = async () => {
  if (tableEnsured) {
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS golden_priority_claims (
      id INT AUTO_INCREMENT PRIMARY KEY,
      song_id INT NOT NULL,
      user_id INT NOT NULL,
      claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_golden_claim (song_id, user_id),
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    )
  `);
  tableEnsured = true;
};

const hasClaimedGoldenReward = async ({ songId, userId }) => {
  if (!songId || !userId) {
    return false;
  }
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT 1
     FROM golden_priority_claims
     WHERE song_id = ? AND user_id = ?
     LIMIT 1`,
    [songId, userId],
  );
  return rows.length > 0;
};

const markGoldenRewardClaimed = async ({ songId, userId }) => {
  if (!songId || !userId) {
    return;
  }
  await ensureTable();
  await pool.query(
    `INSERT INTO golden_priority_claims (song_id, user_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE claimed_at = claimed_at`,
    [songId, userId],
  );
};

module.exports = {
  ensureTable,
  hasClaimedGoldenReward,
  markGoldenRewardClaimed,
};




















