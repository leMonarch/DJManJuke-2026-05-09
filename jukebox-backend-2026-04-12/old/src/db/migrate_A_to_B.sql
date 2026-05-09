-- Migration du schéma A vers le schéma B
-- Ce script ajoute uniquement ce qui manque dans le schéma A
-- Toutes les données existantes sont préservées

USE place_jukebox;

-- ============================================
-- 1. Ajouter la table jukebox_control_usage
-- ============================================
-- Cette table est nécessaire pour le projet B (limitation des skips/previous)
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

-- ============================================
-- 2. Vérifier et ajouter la colonne avatar dans jukeboxes (si pas déjà présente)
-- ============================================
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

-- ============================================
-- 3. Vérifier et ajouter les colonnes genres et recorded_at dans songs (si pas déjà présentes)
-- ============================================
-- Le schéma A les a déjà normalement, mais on vérifie pour être sûr

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

-- ============================================
-- Note importante :
-- ============================================
-- Les tables du catalogue personnel (user_catalog_songs, user_catalog_playlists, etc.)
-- du schéma A sont CONSERVÉES et ne sont PAS supprimées.
-- Elles ne gênent pas le fonctionnement du projet B et peuvent être utilisées plus tard.
-- Si tu veux les supprimer, fais-le manuellement après avoir vérifié qu'elles ne contiennent pas de données importantes.

SELECT 'Migration terminée avec succès !' AS status;

