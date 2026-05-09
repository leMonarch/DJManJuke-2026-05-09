
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
  playback_mode ENUM('public', 'private') NOT NULL DEFAULT 'private',
  master_socket_id VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Ajouter la colonne avatar si elle n'existe pas déjà
SET @avatar_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jukeboxes'
    AND COLUMN_NAME = 'avatar'
);

SET @add_avatar_column_sql := IF(
  @avatar_column_exists = 0,
  'ALTER TABLE jukeboxes ADD COLUMN avatar VARCHAR(255) NULL AFTER location',
  'SELECT 1'
);

PREPARE add_avatar_column_stmt FROM @add_avatar_column_sql;
EXECUTE add_avatar_column_stmt;
DEALLOCATE PREPARE add_avatar_column_stmt;

-- Ajouter la colonne playback_mode si elle n'existe pas déjà
SET @playback_mode_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jukeboxes'
    AND COLUMN_NAME = 'playback_mode'
);

SET @add_playback_mode_sql := IF(
  @playback_mode_exists = 0,
  'ALTER TABLE jukeboxes ADD COLUMN playback_mode ENUM(\'public\', \'private\') NOT NULL DEFAULT \'private\' AFTER avatar',
  'SELECT 1'
);

PREPARE add_playback_mode_stmt FROM @add_playback_mode_sql;
EXECUTE add_playback_mode_stmt;
DEALLOCATE PREPARE add_playback_mode_stmt;

-- Ajouter la colonne master_socket_id si elle n'existe pas déjà
SET @master_socket_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jukeboxes'
    AND COLUMN_NAME = 'master_socket_id'
);

SET @add_master_socket_id_sql := IF(
  @master_socket_id_exists = 0,
  'ALTER TABLE jukeboxes ADD COLUMN master_socket_id VARCHAR(255) NULL AFTER playback_mode',
  'SELECT 1'
);

PREPARE add_master_socket_id_stmt FROM @add_master_socket_id_sql;
EXECUTE add_master_socket_id_stmt;
DEALLOCATE PREPARE add_master_socket_id_stmt;

-- Ajouter la colonne current_song_id si elle n'existe pas déjà
SET @current_song_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jukeboxes'
    AND COLUMN_NAME = 'current_song_id'
);

SET @add_current_song_id_sql := IF(
  @current_song_id_exists = 0,
  'ALTER TABLE jukeboxes ADD COLUMN current_song_id INT NULL AFTER master_socket_id',
  'SELECT 1'
);

PREPARE add_current_song_id_stmt FROM @add_current_song_id_sql;
EXECUTE add_current_song_id_stmt;
DEALLOCATE PREPARE add_current_song_id_stmt;

-- Ajouter la colonne playback_started_at si elle n'existe pas déjà
SET @playback_started_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jukeboxes'
    AND COLUMN_NAME = 'playback_started_at'
);

SET @add_playback_started_at_sql := IF(
  @playback_started_at_exists = 0,
  'ALTER TABLE jukeboxes ADD COLUMN playback_started_at BIGINT NULL AFTER current_song_id',
  'SELECT 1'
);

PREPARE add_playback_started_at_stmt FROM @add_playback_started_at_sql;
EXECUTE add_playback_started_at_stmt;
DEALLOCATE PREPARE add_playback_started_at_stmt;

-- Ajouter la colonne playback_status si elle n'existe pas déjà
SET @playback_status_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'jukeboxes'
    AND COLUMN_NAME = 'playback_status'
);

SET @add_playback_status_sql := IF(
  @playback_status_exists = 0,
  'ALTER TABLE jukeboxes ADD COLUMN playback_status ENUM(\'playing\', \'paused\') NOT NULL DEFAULT \'paused\' AFTER playback_started_at',
  'SELECT 1'
);

PREPARE add_playback_status_stmt FROM @add_playback_status_sql;
EXECUTE add_playback_status_stmt;
DEALLOCATE PREPARE add_playback_status_stmt;

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
  -- Préfixes : index complet (150+150)×4 octets dépasse la limite InnoDB avec utf8mb4 (#1071)
  UNIQUE KEY uniq_song_title_artist (title(100), artist(100)),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- Ajouter les colonnes genres et recorded_at si elles n'existent pas déjà
SET @genre_primary_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'songs'
    AND COLUMN_NAME = 'genre_primary'
);

SET @add_genre_primary_sql := IF(
  @genre_primary_exists = 0,
  'ALTER TABLE songs ADD COLUMN genre_primary VARCHAR(100) NULL AFTER user_id',
  'SELECT 1'
);

PREPARE add_genre_primary_stmt FROM @add_genre_primary_sql;
EXECUTE add_genre_primary_stmt;
DEALLOCATE PREPARE add_genre_primary_stmt;

SET @genre_secondary_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'songs'
    AND COLUMN_NAME = 'genre_secondary'
);

SET @add_genre_secondary_sql := IF(
  @genre_secondary_exists = 0,
  'ALTER TABLE songs ADD COLUMN genre_secondary VARCHAR(100) NULL AFTER genre_primary',
  'SELECT 1'
);

PREPARE add_genre_secondary_stmt FROM @add_genre_secondary_sql;
EXECUTE add_genre_secondary_stmt;
DEALLOCATE PREPARE add_genre_secondary_stmt;

SET @genre_tertiary_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'songs'
    AND COLUMN_NAME = 'genre_tertiary'
);

SET @add_genre_tertiary_sql := IF(
  @genre_tertiary_exists = 0,
  'ALTER TABLE songs ADD COLUMN genre_tertiary VARCHAR(100) NULL AFTER genre_secondary',
  'SELECT 1'
);

PREPARE add_genre_tertiary_stmt FROM @add_genre_tertiary_sql;
EXECUTE add_genre_tertiary_stmt;
DEALLOCATE PREPARE add_genre_tertiary_stmt;

SET @recorded_at_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'songs'
    AND COLUMN_NAME = 'recorded_at'
);

SET @add_recorded_at_sql := IF(
  @recorded_at_exists = 0,
  'ALTER TABLE songs ADD COLUMN recorded_at DATE NULL AFTER genre_tertiary',
  'SELECT 1'
);

PREPARE add_recorded_at_stmt FROM @add_recorded_at_sql;
EXECUTE add_recorded_at_stmt;
DEALLOCATE PREPARE add_recorded_at_stmt;

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

-- Événements de priorité (file d’attente) ; aligné sur priorityEventService.ensureTable()
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
  is_free TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_priority_events_lookup (jukebox_id, song_id, processed, id),
  FOREIGN KEY (jukebox_id) REFERENCES jukeboxes(id) ON DELETE CASCADE,
  FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (investor_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
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

-- Suivi de l'utilisation des contrôles de lecture par propriétaire.
CREATE TABLE IF NOT EXISTS jukebox_control_usage (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  jukebox_id INT NOT NULL,
  usage_date DATE NOT NULL,
  skip_count INT NOT NULL DEFAULT 0,
  previous_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_control_usage (user_id, jukebox_id, usage_date),
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (jukebox_id) REFERENCES jukeboxes(id) ON DELETE CASCADE
);

