USE place_jukebox;
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('artist', 'promoter', 'jukebox_owner', 'listener', 'admin') NOT NULL DEFAULT 'listener',
  plan ENUM('free', 'pro') NOT NULL DEFAULT 'free',
  plan_status ENUM('active', 'inactive', 'trial') NOT NULL DEFAULT 'active',
  stripe_account_id VARCHAR(255) NULL,
  stripe_onboarding_complete TINYINT(1) NOT NULL DEFAULT 0,
  stripe_payouts_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jukeboxes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(150) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(255) NULL,
  avatar VARCHAR(255) NULL,
  owner_user_id INT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS jukebox_location_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jukebox_id INT NOT NULL,
  location VARCHAR(255) NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL,
  FOREIGN KEY (jukebox_id) REFERENCES jukeboxes(id) ON DELETE CASCADE,
  INDEX idx_location_history_jukebox (jukebox_id, started_at)
);

-- Backfill initial location history for existing jukeboxes (idempotent)
INSERT INTO jukebox_location_history (jukebox_id, location, started_at)
SELECT j.id, j.location, COALESCE(j.created_at, NOW())
FROM jukeboxes j
LEFT JOIN jukebox_location_history h ON h.jukebox_id = j.id
WHERE j.location IS NOT NULL
  AND h.id IS NULL;

SET @default_jukebox_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'default_jukebox_id'
);

SET @add_default_jukebox_column_sql := IF(
  @default_jukebox_column_exists = 0,
  'ALTER TABLE users ADD COLUMN default_jukebox_id INT NULL',
  'SELECT 1'
);

PREPARE add_default_jukebox_column_stmt FROM @add_default_jukebox_column_sql;
EXECUTE add_default_jukebox_column_stmt;
DEALLOCATE PREPARE add_default_jukebox_column_stmt;

SET @default_jukebox_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND CONSTRAINT_NAME = 'fk_users_default_jukebox'
);

SET @drop_default_jukebox_fk_sql := IF(
  @default_jukebox_fk_exists > 0,
  'ALTER TABLE users DROP FOREIGN KEY fk_users_default_jukebox',
  'SELECT 1'
);

PREPARE drop_default_jukebox_fk_stmt FROM @drop_default_jukebox_fk_sql;
EXECUTE drop_default_jukebox_fk_stmt;
DEALLOCATE PREPARE drop_default_jukebox_fk_stmt;

SET @add_default_jukebox_fk_sql := IF(
  @default_jukebox_column_exists = 0 OR @default_jukebox_fk_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_default_jukebox FOREIGN KEY (default_jukebox_id) REFERENCES jukeboxes(id) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE add_default_jukebox_fk_stmt FROM @add_default_jukebox_fk_sql;
EXECUTE add_default_jukebox_fk_stmt;
DEALLOCATE PREPARE add_default_jukebox_fk_stmt;

CREATE TABLE IF NOT EXISTS songs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  artist VARCHAR(150) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  image VARCHAR(255) NULL,
  song_order_id INT DEFAULT 0,
  user_id INT NULL,
  genre_primary VARCHAR(100) NULL,
  genre_secondary VARCHAR(100) NULL,
  genre_tertiary VARCHAR(100) NULL,
  recorded_at DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Préfixes : évite #1071 (clé trop longue) avec utf8mb4
  UNIQUE KEY uniq_song_title_artist (title(100), artist(100)),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS song_investments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  song_id INT NOT NULL,
  user_id INT NOT NULL,
  amount_total DECIMAL(10, 2) NOT NULL,
  amount_remaining DECIMAL(10, 2) NOT NULL,
  passive_share TINYINT(1) NOT NULL DEFAULT 0,
  passive_earned DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_song_investments_song_created (song_id, created_at),
  INDEX idx_song_investments_user (user_id)
);

CREATE TABLE IF NOT EXISTS jukebox_songs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jukebox_id INT NOT NULL,
  song_id INT NOT NULL,
  order_id INT DEFAULT 0,
  song_order_id INT DEFAULT 0,
  priority_weight DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_jukebox_song (jukebox_id, song_id),
  FOREIGN KEY (jukebox_id) REFERENCES jukeboxes(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_user_id INT NOT NULL,
  balance DECIMAL(10, 2) DEFAULT 0,
  transaction_type ENUM('credit', 'debit') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  stripe_payment_id VARCHAR(255) NOT NULL,
  current_user_id INT NULL,
  jukebox_user_id INT NULL,
  artist_user_id INT NULL,
  promoter_user_id INT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (current_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (jukebox_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (artist_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (promoter_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS revenue_shares (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_id INT NOT NULL,
  user_id INT NULL,
  role ENUM('song_owner', 'investor', 'jukebox_owner', 'payer', 'platform') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_revenue_shares_user (user_id),
  INDEX idx_revenue_shares_payment (payment_id)
);

CREATE TABLE IF NOT EXISTS payouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'cad',
  status ENUM('pending', 'processing', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  stripe_transfer_id VARCHAR(255) NULL,
  stripe_payout_id VARCHAR(255) NULL,
  failure_reason VARCHAR(255) NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_payouts_user (user_id),
  INDEX idx_payouts_status (status)
);

-- Réservations de solde interne (gains) utilisées pour prioriser ou acheter des titres.
-- Le principe :
-- - status = 'pending' : montant réservé, non encore définitivement "brûlé".
-- - status = 'consumed' : la lecture (ou l'achat) a été complétée, le payout lié reste en "paid".
-- - status = 'cancelled' : la chanson n'a jamais été jouée / l'opération a été annulée,
--   le payout lié est remis en 'failed' et le solde redevient disponible.
CREATE TABLE IF NOT EXISTS balance_reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  jukebox_id INT NOT NULL,
  song_id INT NOT NULL,
  payout_id INT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  type ENUM('priority', 'track_purchase') NOT NULL,
  status ENUM('pending', 'consumed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  consumed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (jukebox_id) REFERENCES jukeboxes(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  FOREIGN KEY (payout_id) REFERENCES payouts(id) ON DELETE SET NULL,
  INDEX idx_balance_reservations_lookup (jukebox_id, song_id, status)
);

-- Snapshot de l'ordre d'une chanson avant la première priorité active.
-- Permet de revenir à la position initiale une fois que toutes les
-- priorités sur cette chanson ont été annulées (sans confondre avec
-- completeSong / fin de lecture).
CREATE TABLE IF NOT EXISTS priority_order_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jukebox_id INT NOT NULL,
  song_id INT NOT NULL,
  original_order_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_priority_snapshot (jukebox_id, song_id),
  FOREIGN KEY (jukebox_id) REFERENCES jukeboxes(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- Catalogue personnel des utilisateurs ("Mon Catalogue")
CREATE TABLE IF NOT EXISTS user_catalog_songs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  song_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_catalog_song (user_id, song_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

-- Listes de lecture basées sur le catalogue personnel
CREATE TABLE IF NOT EXISTS user_catalog_playlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_catalog_playlist_songs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  playlist_id INT NOT NULL,
  song_id INT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_catalog_playlist_song (playlist_id, song_id),
  FOREIGN KEY (playlist_id) REFERENCES user_catalog_playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
);

