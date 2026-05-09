const { pool } = require('../db/pool');

const getBalance = async (userId) => {
  const [rows] = await pool.query(
    'SELECT balance FROM wallet WHERE user_user_id = ? ORDER BY timestamp DESC LIMIT 1',
    [userId],
  );
  return rows[0]?.balance ?? 0;
};

const recordTransaction = async ({ userId, amount, transaction_type }) => {
  const [result] = await pool.query(
    'INSERT INTO wallet (user_user_id, balance, transaction_type, amount) VALUES (?, ?, ?, ?)',
    [userId, 0, transaction_type, amount],
  );
  return {
    id: result.insertId,
    user_user_id: userId,
    transaction_type,
    amount,
  };
};

const walletService = {
  getBalance,
  recordTransaction,
};

module.exports = { walletService };


