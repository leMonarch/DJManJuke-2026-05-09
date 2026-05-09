const { pool } = require('../db/pool');

let tableEnsured = false;

const ensureTable = async () => {
  if (tableEnsured) {
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS priority_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      jukebox_id INT NOT NULL,
      song_id INT NOT NULL,
      user_id INT NULL,
      amount DECIMAL(10, 2) NOT NULL,
      processed TINYINT(1) NOT NULL DEFAULT 0,
      payment_id INT NULL,
      paid_from_remaining_investment TINYINT(1) NOT NULL DEFAULT 0,
      investor_user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_priority_events_lookup (jukebox_id, song_id, processed, id),
      FOREIGN KEY (jukebox_id) REFERENCES jukeboxes(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
      FOREIGN KEY (investor_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
    )
  `);
  
  // Ajouter les colonnes si elles n'existent pas déjà (migration)
  const columnsToAdd = [
    { name: 'paid_from_remaining_investment', type: 'TINYINT(1) NOT NULL DEFAULT 0' },
    { name: 'investor_user_id', type: 'INT NULL' },
    { name: 'is_free', type: 'TINYINT(1) NOT NULL DEFAULT 0' },
  ];
  
  for (const column of columnsToAdd) {
    try {
      await pool.query(`
        ALTER TABLE priority_events
        ADD COLUMN ${column.name} ${column.type}
      `);
    } catch (err) {
      // La colonne existe déjà, ignorer l'erreur (gérer les messages en anglais et français)
      const errorMessage = err.message || '';
      const errorCode = err.code || '';
      const sqlState = err.sqlState || '';
      
      // Ignorer si c'est une erreur de colonne dupliquée
      if (
        errorCode === 'ER_DUP_FIELDNAME' ||
        sqlState === '42S21' ||
        errorMessage.includes('Duplicate column name') ||
        errorMessage.includes("déjà utilisé") ||
        errorMessage.includes("already exists") ||
        errorMessage.includes("Duplicate column")
      ) {
        // Colonne existe déjà, c'est OK, on continue
        continue;
      }
      // Sinon, relancer l'erreur
      throw err;
    }
  }
  tableEnsured = true;
};

const recordEvent = async ({ jukeboxId, songId, userId, amount, paidFromRemainingInvestment = false, investorUserId = null, isFree = false }) => {
  if (!jukeboxId || !songId || !amount || amount <= 0) {
    return;
  }
  await ensureTable();
  await pool.query(
    `INSERT INTO priority_events (jukebox_id, song_id, user_id, amount, paid_from_remaining_investment, investor_user_id, is_free)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [jukeboxId, songId, userId ?? null, amount, paidFromRemainingInvestment ? 1 : 0, investorUserId ?? null, isFree ? 1 : 0],
  );
};

const consumeAllEvents = async ({ jukeboxId, songId }) => {
  if (!jukeboxId || !songId) {
    return null;
  }
  await ensureTable();

  const [rows] = await pool.query(
    `SELECT *
     FROM priority_events
     WHERE jukebox_id = ? AND song_id = ? AND processed = 0
     ORDER BY id ASC`,
    [jukeboxId, songId],
  );

  if (!rows.length) {
    return null;
  }

  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const lastEvent = rows[rows.length - 1];
  
  // Récupérer les utilisateurs qui ont payé avec leur investissement restant
  const usersWithRemainingInvestment = rows
    .filter((row) => row.paid_from_remaining_investment === 1 && row.user_id)
    .map((row) => Number(row.user_id));

  // Déterminer le payerUserId : si quelqu'un a utilisé un investissement restant,
  // utiliser l'investisseur original (investor_user_id), sinon utiliser le dernier événement
  let payerUserId = null;
  const eventsWithRemainingInvestment = rows.filter(
    (row) => row.paid_from_remaining_investment === 1
  );
  if (eventsWithRemainingInvestment.length > 0) {
    // Prendre le dernier événement avec investissement restant et utiliser l'investisseur original
    const lastRemainingInvestmentEvent = eventsWithRemainingInvestment[eventsWithRemainingInvestment.length - 1];
    // L'investisseur original (propriétaire de l'investissement) est le payeur
    payerUserId = lastRemainingInvestmentEvent.investor_user_id 
      ? Number(lastRemainingInvestmentEvent.investor_user_id) 
      : (lastRemainingInvestmentEvent.user_id ? Number(lastRemainingInvestmentEvent.user_id) : null);
  } else {
    // Sinon, utiliser le dernier événement normal
    payerUserId = lastEvent.user_id ? Number(lastEvent.user_id) : null;
  }

  await pool.query(
    `UPDATE priority_events
     SET processed = 1, processed_at = CURRENT_TIMESTAMP
     WHERE jukebox_id = ? AND song_id = ? AND processed = 0`,
    [jukeboxId, songId],
  );

  return {
    totalAmount,
    payerUserId,
    lastEventId: lastEvent.id,
    usersWithRemainingInvestment, // Liste des user_id qui ont utilisé leur investissement restant
  };
};

const consumeLatestEvent = async ({ jukeboxId, songId }) => {
  if (!jukeboxId || !songId) {
    return null;
  }
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT *
     FROM priority_events
     WHERE jukebox_id = ? AND song_id = ? AND processed = 0
     ORDER BY id DESC
     LIMIT 1`,
    [jukeboxId, songId],
  );
  if (!rows.length) {
    return null;
  }
  const event = rows[0];
  await pool.query(
    `UPDATE priority_events
     SET processed = 1, processed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [event.id],
  );
  return event;
};

const consumeLatestEventForUser = async ({ jukeboxId, songId, userId }) => {
  if (!jukeboxId || !songId || !userId) {
    return null;
  }
  await ensureTable();
  const [rows] = await pool.query(
    `SELECT *
     FROM priority_events
     WHERE jukebox_id = ? AND song_id = ? AND user_id = ? AND processed = 0
     ORDER BY id DESC
     LIMIT 1`,
    [jukeboxId, songId, userId],
  );
  if (!rows.length) {
    return null;
  }
  const event = rows[0];
  await pool.query(
    `UPDATE priority_events
     SET processed = 1, processed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [event.id],
  );
  return event;
};

const attachPaymentToEvent = async ({ eventId, paymentId }) => {
  if (!eventId || !paymentId) {
    return;
  }
  await ensureTable();
  await pool.query(
    `UPDATE priority_events
     SET payment_id = ?
     WHERE id = ?`,
    [paymentId, eventId],
  );
};

module.exports = {
  recordEvent,
  consumeLatestEvent,
  consumeAllEvents,
  attachPaymentToEvent,
  ensureTable,
  consumeLatestEventForUser,
};


