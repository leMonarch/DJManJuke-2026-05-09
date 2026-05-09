INSERT INTO users (username, email, password_hash, role)
VALUES
  ('Louis', 'lemirelouisetienne@gmail.com', '$2b$10$L1XPTbHztvGsHiHTdKWQGONmr2656MOX9LoW1l6LiOMcTPdSLrikO', 'admin'),
  ('dj_owner', 'owner@placejukebox.dev', 'hashed-password', 'jukebox_owner'),
  ('artist_aurora', 'aurora@placejukebox.dev', 'hashed-password', 'artist'),
  ('promoter_wave', 'wave@placejukebox.dev', 'hashed-password', 'promoter'),
  ('listener_jane', 'jane@placejukebox.dev', 'hashed-password', 'listener'),
  ('DJManJuke', 'djmanjuke@placejukebox.dev', 'hashed-password', 'admin')
ON DUPLICATE KEY UPDATE username = VALUES(username);

INSERT INTO jukeboxes (slug, name, location, owner_user_id)
VALUES (
  'default',
  'Bar Central',
  'Montréal, QC',
  (SELECT user_id FROM users WHERE email = 'owner@placejukebox.dev' LIMIT 1)
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  location = VALUES(location),
  owner_user_id = VALUES(owner_user_id);

UPDATE users
SET default_jukebox_id = (SELECT id FROM jukeboxes WHERE slug = 'default')
WHERE email = 'owner@placejukebox.dev';

INSERT INTO songs (title, artist, file_path, image, song_order_id, user_id)
VALUES
  ('Angel', 'DJ Nova', '/assets/audio/angel.mp3', '/assets/images/AlbumArtSmall.jpg', 1, 2),
  ('Cigar', 'DJ Nova', '/assets/audio/cigar.wav', '/assets/images/AlbumArtSmall.jpg', 2, 2),
  ('Devil Side', 'Luna Waves', '/assets/audio/devil-side.mp3', '/assets/images/AlbumArtSmall.jpg', 3, 2),
  ('Elle', 'Luna Waves', '/assets/audio/elle.mp3', '/assets/images/AlbumArtSmall.jpg', 4, 2),
  ('Father', 'Luna Waves', '/assets/audio/father.mp3', '/assets/images/AlbumArtSmall.jpg', 5, 2),
  ('Genius', 'Luna Waves', '/assets/audio/genius.mp3', '/assets/images/AlbumArtSmall.jpg', 6, 2),
  ('Great Spirit', 'DJ Nova', '/assets/audio/great-spirit.mp3', '/assets/images/AlbumArtSmall.jpg', 7, 2),
  ('Hard', 'DJ Nova', '/assets/audio/hard.mp3', '/assets/images/AlbumArtSmall.jpg', 8, 2),
  ('Incredible', 'DJ Nova', '/assets/audio/incredible.wav', '/assets/images/AlbumArtSmall.jpg', 9, 2),
  ('Look Around', 'Luna Waves', '/assets/audio/look-around.mp3', '/assets/images/AlbumArtSmall.jpg', 10, 2),
  ('Not My World', 'Luna Waves', '/assets/audio/not-my-world.wav', '/assets/images/AlbumArtSmall.jpg', 11, 2),
  ('Only One', 'Luna Waves', '/assets/audio/only-one.wav', '/assets/images/AlbumArtSmall.jpg', 12, 2),
  ('Stars', 'DJ Nova', '/assets/audio/stars.wav', '/assets/images/AlbumArtSmall.jpg', 13, 2),
  ('Ugly', 'DJ Nova', '/assets/audio/ugly.mp3', '/assets/images/AlbumArtSmall.jpg', 14, 2),
  ('Warning', 'Luna Waves', '/assets/audio/warning.mp3', '/assets/images/AlbumArtSmall.jpg', 15, 2),
  ('World', 'Luna Waves', '/assets/audio/world.mp3', '/assets/images/AlbumArtSmall.jpg', 16, 2)
ON DUPLICATE KEY UPDATE
  file_path = VALUES(file_path),
  image = VALUES(image),
  song_order_id = VALUES(song_order_id),
  user_id = VALUES(user_id);

INSERT INTO jukebox_songs (jukebox_id, song_id, order_id, song_order_id, priority_weight)
SELECT j.id, s.id, s.song_order_id, s.song_order_id, 0
FROM jukeboxes j
CROSS JOIN songs s
LEFT JOIN jukebox_songs js ON js.jukebox_id = j.id AND js.song_id = s.id
WHERE j.slug = 'default'
ON DUPLICATE KEY UPDATE
  order_id = VALUES(order_id),
  song_order_id = VALUES(song_order_id);

