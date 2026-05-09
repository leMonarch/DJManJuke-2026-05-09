-- ============================================
-- SEED SQL - Remplace toutes les données existantes
-- Prérequis : exécuter d’abord schema.sql sur cette base.
-- Adapter le nom si DB_NAME dans .env n’est pas place_jukebox.
-- ============================================

USE place_jukebox;

-- Désactiver temporairement les contraintes de clés étrangères
SET FOREIGN_KEY_CHECKS = 0;

-- Supprimer toutes les données existantes (dans l'ordre inverse des dépendances)
TRUNCATE TABLE jukebox_songs;
TRUNCATE TABLE song_investments;
TRUNCATE TABLE songs;
TRUNCATE TABLE jukebox_location_history;
TRUNCATE TABLE jukeboxes;
TRUNCATE TABLE revenue_shares;
TRUNCATE TABLE payments;
TRUNCATE TABLE wallet;
TRUNCATE TABLE payouts;
TRUNCATE TABLE balance_reservations;
TRUNCATE TABLE priority_order_snapshots;
TRUNCATE TABLE priority_events;
TRUNCATE TABLE jukebox_control_usage;
TRUNCATE TABLE users;

-- Réactiver les contraintes de clés étrangères
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- USERS
-- ============================================
INSERT INTO users (username, email, password_hash, role, plan, plan_status, created_at)
VALUES
  ('Louis', 'lemirelouisetienne@gmail.com', '$2b$10$L1XPTbHztvGsHiHTdKWQGONmr2656MOX9LoW1l6LiOMcTPdSLrikO', 'admin', 'pro', 'active', NOW()),
  ('dj_owner', 'owner@placejukebox.dev', '$2b$10$L1XPTbHztvGsHiHTdKWQGONmr2656MOX9LoW1l6LiOMcTPdSLrikO', 'jukebox_owner', 'pro', 'active', NOW()),
  ('artist_aurora', 'aurora@placejukebox.dev', '$2b$10$L1XPTbHztvGsHiHTdKWQGONmr2656MOX9LoW1l6LiOMcTPdSLrikO', 'artist', 'free', 'active', NOW()),
  ('promoter_wave', 'wave@placejukebox.dev', '$2b$10$L1XPTbHztvGsHiHTdKWQGONmr2656MOX9LoW1l6LiOMcTPdSLrikO', 'promoter', 'free', 'active', NOW()),
  ('listener_jane', 'jane@placejukebox.dev', '$2b$10$L1XPTbHztvGsHiHTdKWQGONmr2656MOX9LoW1l6LiOMcTPdSLrikO', 'listener', 'free', 'active', NOW()),
  ('DJManJuke', 'djmanjuke@placejukebox.dev', '$2b$10$L1XPTbHztvGsHiHTdKWQGONmr2656MOX9LoW1l6LiOMcTPdSLrikO', 'admin', 'pro', 'active', NOW());

-- ============================================
-- JUKEBOXES
-- ============================================
INSERT INTO jukeboxes (slug, name, location, avatar, owner_user_id, playback_mode, created_at)
VALUES (
  'default',
  'Bar Central',
  'Montréal, QC',
  '/media/images/default-jukebox.jpg',
  (SELECT user_id FROM users WHERE email = 'owner@placejukebox.dev' LIMIT 1),
  'public',
  NOW()
);

-- Mettre à jour default_jukebox_id pour les utilisateurs
UPDATE users
SET default_jukebox_id = (SELECT id FROM jukeboxes WHERE slug = 'default' LIMIT 1)
WHERE email IN ('owner@placejukebox.dev', 'lemirelouisetienne@gmail.com', 'djmanjuke@placejukebox.dev');

-- ============================================
-- SONGS
-- ============================================
INSERT INTO songs (title, artist, file_path, image, song_order_id, user_id, genre_primary, genre_secondary, genre_tertiary, created_at)
VALUES
  ('Angel', 'DJ Nova', '/media/audio/angel.mp3', '/media/images/AlbumArtSmall.jpg', 1, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'House', NULL, NOW()),
  ('Cigar', 'DJ Nova', '/media/audio/cigar.wav', '/media/images/AlbumArtSmall.jpg', 2, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Techno', NULL, NOW()),
  ('Devil Side', 'Luna Waves', '/media/audio/devil-side.mp3', '/media/images/AlbumArtSmall.jpg', 3, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Dubstep', NULL, NOW()),
  ('Elle', 'Luna Waves', '/media/audio/elle.mp3', '/media/images/AlbumArtSmall.jpg', 4, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'House', NULL, NOW()),
  ('Father', 'Luna Waves', '/media/audio/father.mp3', '/media/images/AlbumArtSmall.jpg', 5, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Progressive', NULL, NOW()),
  ('Genius', 'Luna Waves', '/media/audio/genius.mp3', '/media/images/AlbumArtSmall.jpg', 6, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Trance', NULL, NOW()),
  ('Great Spirit', 'DJ Nova', '/media/audio/great-spirit.mp3', '/media/images/AlbumArtSmall.jpg', 7, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'House', NULL, NOW()),
  ('Hard', 'DJ Nova', '/media/audio/hard.mp3', '/media/images/AlbumArtSmall.jpg', 8, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Hardstyle', NULL, NOW()),
  ('Incredible', 'DJ Nova', '/media/audio/incredible.wav', '/media/images/AlbumArtSmall.jpg', 9, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'House', NULL, NOW()),
  ('Look Around', 'Luna Waves', '/media/audio/look-around.mp3', '/media/images/AlbumArtSmall.jpg', 10, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Progressive', NULL, NOW()),
  ('Not My World', 'Luna Waves', '/media/audio/not-my-world.wav', '/media/images/AlbumArtSmall.jpg', 11, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Dubstep', NULL, NOW()),
  ('Only One', 'Luna Waves', '/media/audio/only-one.wav', '/media/images/AlbumArtSmall.jpg', 12, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'House', NULL, NOW()),
  ('Stars', 'DJ Nova', '/media/audio/stars.wav', '/media/images/AlbumArtSmall.jpg', 13, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Trance', NULL, NOW()),
  ('Ugly', 'DJ Nova', '/media/audio/ugly.mp3', '/media/images/AlbumArtSmall.jpg', 14, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'House', NULL, NOW()),
  ('Warning', 'Luna Waves', '/media/audio/warning.mp3', '/media/images/AlbumArtSmall.jpg', 15, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Dubstep', NULL, NOW()),
  ('World', 'Luna Waves', '/media/audio/world.mp3', '/media/images/AlbumArtSmall.jpg', 16, (SELECT user_id FROM users WHERE email = 'aurora@placejukebox.dev' LIMIT 1), 'Electronic', 'Progressive', NULL, NOW());

-- ============================================
-- JUKEBOX_SONGS (Lier toutes les chansons au jukebox par défaut)
-- ============================================
INSERT INTO jukebox_songs (jukebox_id, song_id, order_id, song_order_id, priority_weight)
SELECT 
  j.id,
  s.id,
  s.song_order_id,
  s.song_order_id,
  0
FROM jukeboxes j
CROSS JOIN songs s
WHERE j.slug = 'default';

-- ============================================
-- JUKEBOX_LOCATION_HISTORY (Historique initial)
-- ============================================
INSERT INTO jukebox_location_history (jukebox_id, location, started_at)
SELECT 
  id,
  location,
  created_at
FROM jukeboxes
WHERE location IS NOT NULL;

-- ============================================
-- WALLET (Initialiser les portefeuilles pour les utilisateurs)
-- ============================================
INSERT INTO wallet (user_user_id, balance, transaction_type, amount)
SELECT 
  user_id,
  0.00,
  'initial',
  0.00
FROM users
WHERE role IN ('artist', 'promoter', 'jukebox_owner')
ON DUPLICATE KEY UPDATE balance = 0.00;

-- ============================================
-- FIN DU SEED
-- ============================================
-- Note: chemins relatifs /media/audio/, /media/images/ = fichiers sous media/ à la racine du backend.
