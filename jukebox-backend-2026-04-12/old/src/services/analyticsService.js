const { pool } = require('../db/pool');

/**
 * Helper: returns a subquery that extracts song_id from playback payments.
 * We only track stats for automatic jukebox playbacks (stripe_payment_id starting with "playback-").
 */
const PLAYBACK_SUBQUERY = `
  SELECT
    p.id,
    CAST(SUBSTRING_INDEX(p.stripe_payment_id, '-', -1) AS UNSIGNED) AS song_id,
    p.jukebox_user_id,
    p.amount,
    p.created_at
  FROM payments p
  WHERE p.stripe_payment_id LIKE 'playback-%'
`;

const getSongPlaybackStatsForUser = async (userId) => {
  const [rows] = await pool.query(
    `
    SELECT
      s.id AS songId,
      s.title,
      s.artist,
      j.id AS jukeboxId,
      j.slug,
      j.name,
      COALESCE(h.location, j.location) AS location,
      COUNT(*) AS playCount,
      COALESCE(SUM(pb.amount), 0) AS totalAmount,
      MIN(pb.created_at) AS firstPlayedAt,
      MAX(pb.created_at) AS lastPlayedAt
    FROM (${PLAYBACK_SUBQUERY}) AS pb
    JOIN songs s ON s.id = pb.song_id
    LEFT JOIN jukeboxes j ON j.owner_user_id = pb.jukebox_user_id
    LEFT JOIN jukebox_location_history h
      ON h.jukebox_id = j.id
     AND pb.created_at >= h.started_at
     AND (h.ended_at IS NULL OR pb.created_at < h.ended_at)
    WHERE s.user_id = ?
    GROUP BY s.id, j.id, COALESCE(h.location, j.location)
    ORDER BY s.title ASC, playCount DESC
  `,
    [userId],
  );

  const bySong = new Map();

  rows.forEach((row) => {
    const songId = row.songId;
    if (!songId) {
      return;
    }

    const playCount = Number(row.playCount ?? 0);
    const totalAmount = Number(row.totalAmount ?? 0);

    const existing = bySong.get(songId) || {
      songId,
      title: row.title,
      artist: row.artist,
      totalPlays: 0,
      totalAmount: 0,
      locations: [],
    };

    existing.totalPlays += playCount;
    existing.totalAmount = Number((existing.totalAmount + totalAmount).toFixed(2));

    if (row.jukeboxId) {
      existing.locations.push({
        jukeboxId: row.jukeboxId,
        slug: row.slug,
        name: row.name,
        location: row.location,
        playCount,
        totalAmount,
        firstPlayedAt: row.firstPlayedAt,
        lastPlayedAt: row.lastPlayedAt,
      });
    }

    bySong.set(songId, existing);
  });

  return Array.from(bySong.values());
};

const getJukeboxPlaybackStatsForUser = async (userId) => {
  const [rows] = await pool.query(
    `
    SELECT
      j.id AS jukeboxId,
      j.slug,
      j.name,
      j.location,
      s.id AS songId,
      s.title,
      s.artist,
      COUNT(*) AS playCount,
      COALESCE(SUM(pb.amount), 0) AS totalAmount,
      MIN(pb.created_at) AS firstPlayedAt,
      MAX(pb.created_at) AS lastPlayedAt
    FROM (${PLAYBACK_SUBQUERY}) AS pb
    JOIN jukeboxes j ON j.owner_user_id = ? AND j.owner_user_id = pb.jukebox_user_id
    JOIN songs s ON s.id = pb.song_id
    GROUP BY j.id, s.id
    ORDER BY j.slug ASC, playCount DESC
  `,
    [userId],
  );

  const byJukebox = new Map();

  rows.forEach((row) => {
    const jukeboxId = row.jukeboxId;
    if (!jukeboxId) {
      return;
    }

    const playCount = Number(row.playCount ?? 0);
    const totalAmount = Number(row.totalAmount ?? 0);

    const existing = byJukebox.get(jukeboxId) || {
      jukeboxId,
      slug: row.slug,
      name: row.name,
      location: row.location,
      totalPlays: 0,
      totalAmount: 0,
      songs: [],
    };

    existing.totalPlays += playCount;
    existing.totalAmount = Number((existing.totalAmount + totalAmount).toFixed(2));

    existing.songs.push({
      songId: row.songId,
      title: row.title,
      artist: row.artist,
      playCount,
      totalAmount,
      firstPlayedAt: row.firstPlayedAt,
      lastPlayedAt: row.lastPlayedAt,
    });

    byJukebox.set(jukeboxId, existing);
  });

  return Array.from(byJukebox.values());
};

const getAnalyticsOverviewForUser = async (userId) => {
  const [songs, jukeboxes] = await Promise.all([
    getSongPlaybackStatsForUser(userId),
    getJukeboxPlaybackStatsForUser(userId),
  ]);

  return {
    songs,
    jukeboxes,
  };
};

const analyticsService = {
  getSongPlaybackStatsForUser,
  getJukeboxPlaybackStatsForUser,
  getAnalyticsOverviewForUser,
};

module.exports = { analyticsService };


