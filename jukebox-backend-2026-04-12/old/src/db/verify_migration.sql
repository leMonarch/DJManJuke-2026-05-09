-- Script de vérification de la migration A vers B
-- Exécute ce script pour vérifier que toutes les tables et colonnes nécessaires sont présentes

USE place_jukebox;

-- Vérifier que la table jukebox_control_usage existe
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✓ Table jukebox_control_usage existe'
    ELSE '✗ Table jukebox_control_usage MANQUANTE'
  END AS status
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'jukebox_control_usage';

-- Vérifier que la colonne avatar existe dans jukeboxes
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✓ Colonne avatar existe dans jukeboxes'
    ELSE '✗ Colonne avatar MANQUANTE dans jukeboxes'
  END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'jukeboxes'
  AND COLUMN_NAME = 'avatar';

-- Vérifier que les colonnes genres existent dans songs
SELECT 
  CASE 
    WHEN COUNT(*) = 3 THEN '✓ Toutes les colonnes genres existent dans songs'
    ELSE CONCAT('✗ Manque ', 3 - COUNT(*), ' colonne(s) genre dans songs')
  END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'songs'
  AND COLUMN_NAME IN ('genre_primary', 'genre_secondary', 'genre_tertiary');

-- Vérifier que la colonne recorded_at existe dans songs
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✓ Colonne recorded_at existe dans songs'
    ELSE '✗ Colonne recorded_at MANQUANTE dans songs'
  END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'songs'
  AND COLUMN_NAME = 'recorded_at';

-- Vérifier que les tables critiques du projet B existent
SELECT 
  CASE 
    WHEN COUNT(*) = 3 THEN '✓ Toutes les tables critiques existent'
    ELSE CONCAT('✗ Manque ', 3 - COUNT(*), ' table(s) critique(s)')
  END AS status
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('balance_reservations', 'priority_order_snapshots', 'jukebox_control_usage');

-- Afficher un résumé
SELECT 'Vérification terminée. Vérifiez les résultats ci-dessus.' AS message;

