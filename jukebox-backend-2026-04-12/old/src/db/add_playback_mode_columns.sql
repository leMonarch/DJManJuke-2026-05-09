USE place_jukebox;

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
  'SELECT 1 AS playback_mode_already_exists'
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
  'SELECT 1 AS master_socket_id_already_exists'
);

PREPARE add_master_socket_id_stmt FROM @add_master_socket_id_sql;
EXECUTE add_master_socket_id_stmt;
DEALLOCATE PREPARE add_master_socket_id_stmt;

