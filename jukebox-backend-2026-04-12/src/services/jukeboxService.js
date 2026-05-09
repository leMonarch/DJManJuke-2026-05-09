const { pool } = require('../db/pool');
const { playlistLogic } = require('../utils/playlistLogic');
const { env } = require('../config/env');
const investmentService = require('./investmentService');
const priorityEventService = require('./priorityEventService');
const { emitPlaybackStart, emitQueueUpdate, isJukeboxConnected } = require('../ws/jukeboxSockets');
const { recordRevenueSplit, resolveRevenueParticipants } = require('./revenueService');
const {
  consumePriorityReservationsForSong,
  cancelLatestPriorityReservationForUserOnSong,
} = require('./balanceReservationService');
const {
  createPriorityOrderSnapshot,
  restoreAndDeletePriorityOrderSnapshot,
  clearPriorityOrderSnapshot,
} = require('./priorityOrderSnapshotService');
const { checkAndIncrementControlUsage } = require('./jukeboxControlService');

const getJukeboxBySlug = async (slug) => {
  try {
    const [rows] = await pool.query('SELECT id, slug, name, owner_user_id, location, playback_mode, master_socket_id, current_song_id, playback_started_at, playback_status FROM jukeboxes WHERE slug = ? LIMIT 1', [slug]);
    if (!rows.length) {
      const error = new Error('Jukebox not found');
      error.statusCode = 404;
      throw error;
    }
    const jukebox = rows[0];
    // Fallback si les colonnes n'existent pas encore
    if (jukebox.playback_mode === undefined) {
      jukebox.playback_mode = 'private';
    }
    if (jukebox.master_socket_id === undefined) {
      jukebox.master_socket_id = null;
    }
    if (jukebox.current_song_id === undefined) {
      jukebox.current_song_id = null;
    }
    if (jukebox.playback_started_at === undefined) {
      jukebox.playback_started_at = null;
    }
    if (jukebox.playback_status === undefined) {
      jukebox.playback_status = 'paused';
    }
    return jukebox;
  } catch (err) {
    // Si les colonnes n'existent pas, faire une requête sans elles
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      const [rows] = await pool.query('SELECT id, slug, name, owner_user_id, location FROM jukeboxes WHERE slug = ? LIMIT 1', [slug]);
      if (!rows.length) {
        const error = new Error('Jukebox not found');
        error.statusCode = 404;
        throw error;
      }
      return {
        ...rows[0],
        playback_mode: 'private',
        master_socket_id: null,
        current_song_id: null,
        playback_started_at: null,
        playback_status: 'paused',
      };
    }
    throw err;
  }
};

const ensureJukeboxAccess = (user, jukebox) => {
  if (!user) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }
  const isOwner = jukebox.owner_user_id === user.user_id;
  const isAdmin = user.role === 'admin';
  if (!isOwner && !isAdmin) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
};

const ensureSongExists = async (songId) => {
  const [rows] = await pool.query('SELECT id FROM songs WHERE id = ? LIMIT 1', [songId]);
  if (!rows.length) {
    const error = new Error('Song not found');
    error.statusCode = 404;
    throw error;
  }
};

const fetchCatalogSongs = async (jukeboxId) => {
  const [rows] = await pool.query(
    `SELECT
       s.*,
       owner.username AS owner_username,
       CASE WHEN js.id IS NULL THEN 0 ELSE 1 END AS is_in_jukebox
     FROM songs s
     LEFT JOIN users owner ON owner.user_id = s.user_id
     LEFT JOIN jukebox_songs js
       ON js.song_id = s.id
      AND js.jukebox_id = ?
     ORDER BY s.title ASC, s.artist ASC, s.id ASC`,
    [jukeboxId],
  );
  return rows.map((row) => ({
    ...row,
    is_in_jukebox: Boolean(row.is_in_jukebox),
    owner_username: row.owner_username ?? null,
  }));
};

const fetchPlaylistRows = async (slug) => {
  await priorityEventService.ensureTable();
  const [rows] = await pool.query(
    `SELECT
       js.id AS jukebox_song_id,
       js.order_id,
       js.song_order_id,
       js.priority_weight,
       s.*,
       pending.total_amount AS pending_priority_amount,
       free_priorities.has_free_priority
     FROM jukebox_songs js
     JOIN jukeboxes j ON js.jukebox_id = j.id
     JOIN songs s ON js.song_id = s.id
     LEFT JOIN (
       SELECT
         jukebox_id,
         song_id,
         SUM(amount) AS total_amount
       FROM priority_events
       WHERE processed = 0 AND is_free = 0
       GROUP BY jukebox_id, song_id
     ) AS pending
       ON pending.jukebox_id = j.id
      AND pending.song_id = s.id
     LEFT JOIN (
       SELECT
         jukebox_id,
         song_id,
         MAX(is_free) AS has_free_priority
       FROM priority_events
       WHERE processed = 0 AND is_free = 1
       GROUP BY jukebox_id, song_id
     ) AS free_priorities
       ON free_priorities.jukebox_id = j.id
      AND free_priorities.song_id = s.id
     WHERE j.slug = ?
     ORDER BY 
       COALESCE(pending.total_amount, 0) DESC,
       js.priority_weight DESC,
       js.order_id ASC`,
    [slug],
  );
  const songIds = rows.map((row) => row.id);
  const investmentMap = await investmentService.listInvestmentsForSongs(songIds);
  return rows.map((row) => {
    // priority_total ne doit inclure que les priorités payantes (is_free = 0)
    // Si pending_priority_amount est NULL, cela signifie qu'il n'y a que des priorités gratuites ou aucune priorité
    // Dans ce cas, on retourne 0 au lieu d'utiliser priority_weight qui inclut les priorités gratuites
    const pendingAmount = row.pending_priority_amount != null ? Number(row.pending_priority_amount) : 0;
    const hasFreePriority = row.has_free_priority != null && row.has_free_priority === 1;
    return {
      ...row,
      priority_total: pendingAmount,
      has_free_priority: hasFreePriority,
      investments: investmentMap.get(row.id) ?? [],
      is_golden: (investmentMap.get(row.id) ?? []).length > 0,
    };
  });
};

const previewPriorityForSong = async ({ slug, songId, amount, currentSongId = null }) => {
  const baseRows = await fetchPlaylistRows(slug);
  const rows = reorderQueue(baseRows, { currentSongId });
  const targetId = Number(songId);
  const normalizedAmount = Number.isFinite(Number(amount)) && Number(amount) >= 0.5 ? Number(amount) : 0.5;

  const currentIndex = rows.findIndex((row) => row.id === targetId);
  if (currentIndex < 0 || rows.length <= 1) {
    return {
      currentRank: currentIndex >= 0 ? currentIndex + 1 : null,
      newRank: currentIndex >= 0 ? currentIndex + 1 : null,
      willMoveUp: false,
    };
  }

  const getEffectivePriority = (row) => Number(row.pending_priority_amount ?? row.priority_weight ?? 0);
  const currentRank = currentIndex + 1;

  const activeId = currentSongId ? Number(currentSongId) : null;
  const pinnedRow = activeId ? rows.find((row) => row.id === activeId) : null;
  const otherRows = pinnedRow ? rows.filter((row) => row.id !== activeId) : rows;

  const sortedOthers = [...otherRows].sort((a, b) => {
    const effectiveA =
      a.id === targetId ? getEffectivePriority(a) + normalizedAmount : getEffectivePriority(a);
    const effectiveB =
      b.id === targetId ? getEffectivePriority(b) + normalizedAmount : getEffectivePriority(b);
    if (effectiveA !== effectiveB) {
      return effectiveB - effectiveA;
    }
    return a.order_id - b.order_id;
  });

  const simulatedQueue = pinnedRow ? [pinnedRow, ...sortedOthers] : sortedOthers;

  const newIndex = simulatedQueue.findIndex((row) => row.id === targetId);
  const newRank = newIndex >= 0 ? newIndex + 1 : currentRank;

  return {
    currentRank,
    newRank,
    willMoveUp: newRank < currentRank,
  };
};

const reorderQueue = (rows, { currentSongId = null, completedSongId = null } = {}) => {
  const queue = [...rows];

  if (completedSongId) {
    const completedIndex = queue.findIndex((row) => row.id === Number(completedSongId));
    if (completedIndex >= 0) {
      const [completed] = queue.splice(completedIndex, 1);
      queue.push(completed);
    }
  }

  if (currentSongId) {
    const numericId = Number(currentSongId);
    const index = queue.findIndex((row) => row.id === numericId);
    if (index > 0) {
      const [current] = queue.splice(index, 1);
      queue.unshift(current);
    }
  }

  return queue;
};

const getPlaylist = async (slug) => {
  const rows = await fetchPlaylistRows(slug);
  return playlistLogic.ensurePlayableQueue(rows);
};

const normalizeQueueOrdering = async (slug, options = {}) => {
  const rows = reorderQueue(await fetchPlaylistRows(slug), options);
  let order = 1;
  // sequential ordering based on current priority-weighted ordering
  // eslint-disable-next-line no-restricted-syntax
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE jukebox_songs SET order_id = ? WHERE id = ?', [order, row.jukebox_song_id]);
    order += 1;
  }
};

/**
 * Met à jour jukeboxes.current_song_id, playback_started_at, playback_status selon la tête de file.
 * ENUM playback_status : seulement 'playing' | 'paused' en base ; file vide → paused + IDs null (idle).
 *
 * @param {string} slug
 * @param {{ source: 'skip'|'prioritize'|'addToEmptyQueue'|'complete', completedSongId?: number|null, playlist?: unknown[] }} opts
 * @returns {Promise<{ song: object|null, playback_started_at: number|null, transitioned: boolean }>}
 */
const startPlaybackForQueueHead = async (slug, opts = {}) => {
  const { source, completedSongId = null, playlist: playlistOpt = null } = opts;
  const playlist = playlistOpt ?? (await getPlaylist(slug));
  const jukebox = await getJukeboxBySlug(slug);
  const head = playlist?.length ? playlist[0] : null;

  // eslint-disable-next-line no-console
  console.log('[playbackTransition]', { source, slug, headSongId: head?.id ?? null });

  if (!head) {
    await pool.query(
      'UPDATE jukeboxes SET current_song_id = NULL, playback_started_at = NULL, playback_status = ? WHERE id = ?',
      ['paused', jukebox.id],
    );
    return { song: null, playback_started_at: null, transitioned: true };
  }

  // completeSong : la piste complétée reste en tête → pause sans nouveau playback:start (inchangé vs ancien comportement)
  if (completedSongId != null && Number(head.id) === Number(completedSongId)) {
    await pool.query('UPDATE jukeboxes SET playback_status = ? WHERE id = ?', ['paused', jukebox.id]);
    return {
      song: head,
      playback_started_at: jukebox.playback_started_at != null ? Number(jukebox.playback_started_at) : null,
      transitioned: false,
    };
  }

  const currentId = jukebox.current_song_id != null ? Number(jukebox.current_song_id) : null;
  const headId = Number(head.id);
  if (currentId === headId && jukebox.playback_status === 'playing') {
    return {
      song: head,
      playback_started_at: jukebox.playback_started_at != null ? Number(jukebox.playback_started_at) : null,
      transitioned: false,
    };
  }

  const startedAt = Date.now();
  await pool.query(
    'UPDATE jukeboxes SET current_song_id = ?, playback_started_at = ?, playback_status = ? WHERE id = ?',
    [headId, startedAt, 'playing', jukebox.id],
  );
  return { song: head, playback_started_at: startedAt, transitioned: true };
};

const getCatalogForUser = async (slug, user) => {
  const jukebox = await getJukeboxBySlug(slug);
  ensureJukeboxAccess(user, jukebox);
  const songs = await fetchCatalogSongs(jukebox.id);
  return { jukebox, songs };
};

const addSongToJukeboxById = async (jukeboxId, songId) => {
  if (!jukeboxId) {
    return;
  }
  await ensureSongExists(songId);
  const [existing] = await pool.query(
    'SELECT id FROM jukebox_songs WHERE jukebox_id = ? AND song_id = ? LIMIT 1',
    [jukeboxId, songId],
  );
  if (existing.length) {
    return;
  }
  const [orderRows] = await pool.query(
    'SELECT COALESCE(MAX(order_id), 0) AS maxOrder FROM jukebox_songs WHERE jukebox_id = ?',
    [jukeboxId],
  );
  const nextOrder = Number(orderRows[0]?.maxOrder ?? 0) + 1;
  await pool.query(
    'INSERT INTO jukebox_songs (jukebox_id, song_id, order_id, song_order_id, priority_weight) VALUES (?, ?, ?, ?, 0)',
    [jukeboxId, songId, nextOrder, nextOrder],
  );
};

const updateJukeboxLocation = async (slug, location) => {
  const jukebox = await getJukeboxBySlug(slug);
  const normalizedLocation = location || null;

  // Si l'adresse ne change pas, on ne crée pas de nouvelle entrée d'historique.
  if (jukebox.location === normalizedLocation) {
    return {
      id: jukebox.id,
      slug: jukebox.slug,
      name: jukebox.name,
      location: jukebox.location,
    };
  }

  // Clôture de la dernière adresse active, le cas échéant.
  await pool.query(
    'UPDATE jukebox_location_history SET ended_at = NOW() WHERE jukebox_id = ? AND ended_at IS NULL',
    [jukebox.id],
  );

  // Enregistre la nouvelle adresse seulement si elle n'est pas vide.
  if (normalizedLocation) {
    await pool.query(
      'INSERT INTO jukebox_location_history (jukebox_id, location, started_at) VALUES (?, ?, NOW())',
      [jukebox.id, normalizedLocation],
    );
  }

  await pool.query('UPDATE jukeboxes SET location = ? WHERE id = ?', [normalizedLocation, jukebox.id]);

  return {
    id: jukebox.id,
    slug: jukebox.slug,
    name: jukebox.name,
    location: normalizedLocation,
  };
};

const listJukeboxLocations = async (slug) => {
  const jukebox = await getJukeboxBySlug(slug);
  const [rows] = await pool.query(
    `SELECT location, MAX(started_at) AS last_used
     FROM jukebox_location_history
     WHERE jukebox_id = ? AND location IS NOT NULL AND location <> ''
     GROUP BY location
     ORDER BY last_used DESC`,
    [jukebox.id],
  );

  return rows.map((row) => row.location);
};

const addSongToJukebox = async (slug, songId, user) => {
  const { jukebox } = await getCatalogForUser(slug, user);
  const [[countRow]] = await pool.query(
    'SELECT COUNT(*) AS c FROM jukebox_songs WHERE jukebox_id = ?',
    [jukebox.id],
  );
  const wasEmpty = Number(countRow?.c ?? 0) === 0;

  await addSongToJukeboxById(jukebox.id, songId);
  await normalizeQueueOrdering(slug);
  const songs = await fetchCatalogSongs(jukebox.id);

  const playlist = await getPlaylist(slug);
  let playback = { song: null, playback_started_at: null, transitioned: false };
  if (wasEmpty) {
    playback = await startPlaybackForQueueHead(slug, { source: 'addToEmptyQueue', playlist });
  }
  emitQueueUpdate({ slug, playlist });
  if (playback.transitioned && playback.song) {
    emitPlaybackStart({
      slug,
      track: playback.song,
      startedAt: playback.playback_started_at,
    });
  }

  return songs;
};

const removeSongFromJukebox = async (slug, songId, user) => {
  const jukebox = await getJukeboxBySlug(slug);
  ensureJukeboxAccess(user, jukebox);
  await pool.query('DELETE FROM jukebox_songs WHERE jukebox_id = ? AND song_id = ?', [jukebox.id, songId]);
  await normalizeQueueOrdering(slug);
  const songs = await fetchCatalogSongs(jukebox.id);
  
  // Émettre un événement WebSocket pour notifier tous les clients de la mise à jour de la playlist
  const playlist = await getPlaylist(slug);
  emitQueueUpdate({ slug, playlist });
  
  return songs;
};

const reloadPlaylist = async (slug, currentSongId = null) => {
  await normalizeQueueOrdering(slug, { currentSongId });
  return getPlaylist(slug);
};

const getJukeboxIdAndEnsureOwner = async (slug, user) => {
  const jukebox = await getJukeboxBySlug(slug);
  ensureJukeboxAccess(user, jukebox);
  return jukebox.id;
};

const prioritizeSong = async (slug, songId, amount = 0.5, currentSongId = null, userId = null, paidFromRemainingInvestment = false, investorUserId = null, isFree = false) => {
  if (!songId) {
    const error = new Error('songId is required');
    error.statusCode = 400;
    throw error;
  }

  const parsedAmount = Number(amount);
  const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0.5 ? parsedAmount : 0.5;
  const jukebox = await getJukeboxBySlug(slug);

  // Avant de modifier la priorité, on prend un snapshot de la position
  // actuelle de cette chanson dans la file, afin de pouvoir y revenir
  // si toutes les priorités sont ensuite annulées (sans confondre avec
  // la fin de lecture completeSong).
  await createPriorityOrderSnapshot({
    jukeboxId: jukebox.id,
    songId,
  });

  await pool.query(
    `UPDATE jukebox_songs js
     JOIN jukeboxes j ON js.jukebox_id = j.id
     SET js.priority_weight = ?
     WHERE j.slug = ? AND js.song_id = ?`,
    [normalizedAmount, slug, songId],
  );

  await priorityEventService.recordEvent({
    jukeboxId: jukebox.id,
    songId,
    userId,
    amount: normalizedAmount,
    paidFromRemainingInvestment,
    investorUserId,
    isFree,
  });

  await normalizeQueueOrdering(slug, { currentSongId });
  const playlist = await getPlaylist(slug);
  const playback = await startPlaybackForQueueHead(slug, { source: 'prioritize', playlist });
  emitQueueUpdate({ slug, playlist });
  if (playback.transitioned && playback.song) {
    emitPlaybackStart({
      slug,
      track: playback.song,
      startedAt: playback.playback_started_at,
    });
  }
  return playlist;
};

const skipToNext = async ({ slug, user }) => {
  const jukeboxId = await getJukeboxIdAndEnsureOwner(slug, user);

  await checkAndIncrementControlUsage({
    userId: user.user_id,
    jukeboxId,
    type: 'skip',
  });

  const playlist = await getPlaylist(slug);
  if (!playlist.length || playlist.length < 2) {
    return playlist;
  }

  const [current, ...rest] = playlist;
  const newQueue = [...rest, current];

  // Mise à jour de l'ordre en base selon le nouvel ordre.
  let order = 1;
  // eslint-disable-next-line no-restricted-syntax
  for (const track of newQueue) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE jukebox_songs SET order_id = ? WHERE id = ?', [order, track.jukebox_song_id]);
    order += 1;
  }

  const updated = await getPlaylist(slug);
  const playback = await startPlaybackForQueueHead(slug, { source: 'skip', playlist: updated });
  emitQueueUpdate({ slug, playlist: updated });
  if (playback.transitioned && playback.song) {
    emitPlaybackStart({
      slug,
      track: playback.song,
      startedAt: playback.playback_started_at,
    });
  }
  return updated;
};

const skipToPrevious = async ({ slug, user }) => {
  const jukeboxId = await getJukeboxIdAndEnsureOwner(slug, user);

  await checkAndIncrementControlUsage({
    userId: user.user_id,
    jukeboxId,
    type: 'previous',
  });

  const playlist = await getPlaylist(slug);
  if (!playlist.length || playlist.length < 2) {
    return playlist;
  }

  const last = playlist[playlist.length - 1];
  const remaining = playlist.slice(0, playlist.length - 1);
  const newQueue = [last, ...remaining];

  let order = 1;
  // eslint-disable-next-line no-restricted-syntax
  for (const track of newQueue) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE jukebox_songs SET order_id = ? WHERE id = ?', [order, track.jukebox_song_id]);
    order += 1;
  }

  const updated = await getPlaylist(slug);
  const playback = await startPlaybackForQueueHead(slug, { source: 'skip', playlist: updated });
  emitQueueUpdate({ slug, playlist: updated });
  if (playback.transitioned && playback.song) {
    emitPlaybackStart({
      slug,
      track: playback.song,
      startedAt: playback.playback_started_at,
    });
  }
  return updated;
};

const completeSong = async (slug, songId, currentSongId = null) => {
  if (!songId) {
    const error = new Error('songId is required');
    error.statusCode = 400;
    throw error;
  }

  const [songRows] = await pool.query(
    `SELECT js.priority_weight
     FROM jukebox_songs js
     JOIN jukeboxes j ON js.jukebox_id = j.id
     WHERE j.slug = ? AND js.song_id = ?
     LIMIT 1`,
    [slug, songId],
  );

  await pool.query(
    `UPDATE jukebox_songs js
     JOIN jukeboxes j ON js.jukebox_id = j.id
     SET js.priority_weight = 0
     WHERE j.slug = ? AND js.song_id = ?`,
    [slug, songId],
  );

  const priorityWeight = Number(songRows[0]?.priority_weight ?? 0);
  const jukebox = await getJukeboxBySlug(slug);
  const priorityAggregate = await priorityEventService.consumeAllEvents({ jukeboxId: jukebox.id, songId });

  let playbackCost = 0;
  let payerUserId = null;
  let lastPriorityEventId = null;

  if (priorityAggregate && Number(priorityAggregate.totalAmount) > 0) {
    playbackCost = Number(priorityAggregate.totalAmount);
    payerUserId = priorityAggregate.payerUserId ?? null;
    lastPriorityEventId = priorityAggregate.lastEventId ?? null;
  }

  if (playbackCost > 0) {
    await investmentService.consumeInvestment(songId, playbackCost);
    const participants = await resolveRevenueParticipants({ songId, slug });
    const [paymentResult] = await pool.query(
      `INSERT INTO payments (stripe_payment_id, current_user_id, jukebox_user_id, artist_user_id, promoter_user_id, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `playback-${Date.now()}-${songId}`,
        payerUserId,
        participants.jukeboxOwnerId ?? null,
        participants.songOwnerId ?? null,
        null,
        playbackCost,
      ],
    );
    const paymentId = paymentResult.insertId;
    const passiveData = await investmentService.recordPassiveRevenue(songId, playbackCost);
    await recordRevenueSplit({
      paymentId,
      amount: playbackCost,
      songId,
      songOwnerId: participants.songOwnerId ?? participants.platformUserId ?? null,
      jukeboxOwnerId: participants.jukeboxOwnerId,
      payerUserId,
      passiveInvestors: passiveData?.investors ?? [],
      platformUserId: participants.platformUserId,
    });
    if (lastPriorityEventId) {
      await priorityEventService.attachPaymentToEvent({
        eventId: lastPriorityEventId,
        paymentId,
      });
    }
    // Toute priorité payée avec le solde interne (gains) pour cette
    // chanson est désormais considérée comme consommée : on marque
    // les réservations associées comme "consumed" et les payouts
    // liés passent en "paid".
    await consumePriorityReservationsForSong({
      jukeboxId: jukebox.id,
      songId,
    });
    
    // Créditer 0.10$ au solde des utilisateurs qui ont utilisé leur investissement restant
    // pour réinvestissement (gain de 0.10$)
    const usersWithRemainingInvestment = priorityAggregate.usersWithRemainingInvestment ?? [];
    if (usersWithRemainingInvestment.length > 0) {
      const rewardAmount = 0.10;
      await Promise.all(
        usersWithRemainingInvestment.map((userId) =>
          pool.query(
            `INSERT INTO payouts (user_id, amount, currency, status, stripe_transfer_id, stripe_payout_id, failure_reason, requested_at, processed_at)
             VALUES (?, ?, ?, 'paid', NULL, NULL, NULL, NOW(), NOW())`,
            [userId, -rewardAmount, env.STRIPE_DEFAULT_CURRENCY || 'cad'],
          ),
        ),
      );
    }
  } else if (priorityWeight > 0) {
    await investmentService.consumeInvestment(songId, priorityWeight + 0.25);
  }

  // Après la fin de lecture, on considère que la séquence de priorité
  // est terminée pour cette chanson : tout snapshot d'ordre précédent
  // n'est plus pertinent et peut être supprimé.
  await clearPriorityOrderSnapshot({
    jukeboxId: jukebox.id,
    songId,
  });

  await normalizeQueueOrdering(slug, { currentSongId, completedSongId: songId });
  const playlist = await getPlaylist(slug);
  const playback = await startPlaybackForQueueHead(slug, {
    source: 'complete',
    completedSongId: songId,
    playlist,
  });
  emitQueueUpdate({ slug, playlist });
  if (playback.transitioned && playback.song) {
    emitPlaybackStart({
      slug,
      track: playback.song,
      startedAt: playback.playback_started_at,
    });
  }
  return playlist;
};

const updatePlaybackMode = async (slug, playbackMode, user) => {
  if (!playbackMode || !['public', 'private'].includes(playbackMode)) {
    const error = new Error('playbackMode must be "public" or "private"');
    error.statusCode = 400;
    throw error;
  }

  const jukebox = await getJukeboxBySlug(slug);
  ensureJukeboxAccess(user, jukebox);

  try {
    await pool.query('UPDATE jukeboxes SET playback_mode = ? WHERE slug = ?', [playbackMode, slug]);

    // Si on passe en mode privé, libérer le device maître
    if (playbackMode === 'private') {
      try {
        await pool.query('UPDATE jukeboxes SET master_socket_id = NULL WHERE slug = ?', [slug]);
      } catch (err) {
        // Colonne master_socket_id n'existe pas encore, ignorer
        if (err.code !== 'ER_BAD_FIELD_ERROR') {
          throw err;
        }
      }
    }
  } catch (err) {
    // Si les colonnes n'existent pas encore, on ne peut pas mettre à jour
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      const error = new Error('Les colonnes playback_mode et master_socket_id doivent être ajoutées à la base de données. Exécutez la migration schema.sql.');
      error.statusCode = 500;
      throw error;
    }
    throw err;
  }

  const updatedJukebox = await getJukeboxBySlug(slug);
  
  // Récupérer la playlist actuelle pour la synchroniser avec tous les clients
  const playlist = await getPlaylist(slug);
  
  // Émettre un événement WebSocket pour notifier tous les clients du changement de mode
  const { emitPlaylistState, emitQueueUpdate } = require('../ws/jukeboxSockets');
  await emitPlaylistState({ slug });
  // Émettre aussi queue:update pour garantir que tous les clients reçoivent la playlist synchronisée
  emitQueueUpdate({ slug, playlist });
  
  return updatedJukebox;
};

const cancelPriorityForSong = async ({ slug, songId, userId, currentSongId = null }) => {
  if (!songId) {
    const error = new Error('songId is required');
    error.statusCode = 400;
    throw error;
  }
  if (!userId) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  const jukebox = await getJukeboxBySlug(slug);

  // On annule d'abord l'évènement de priorité correspondant à cet utilisateur.
  const event = await priorityEventService.consumeLatestEventForUser({
    jukeboxId: jukebox.id,
    songId,
    userId,
  });

  if (!event) {
    const error = new Error("Aucune priorité active à annuler pour cette chanson.");
    error.statusCode = 400;
    throw error;
  }

  // On annule la réservation de solde (gains) pour cet utilisateur seulement si ce n'est pas une priorité gratuite
  const isFreePriority = event.is_free === 1;
  if (!isFreePriority) {
    await cancelLatestPriorityReservationForUserOnSong({
      userId,
      jukeboxId: jukebox.id,
      songId,
    });
  }

  // Recalculer le priority_weight à partir des priorités en attente restantes
  // (inclure toutes les priorités, même gratuites, pour le tri)
  const [[pendingRow]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM priority_events
     WHERE jukebox_id = ? AND song_id = ? AND processed = 0`,
    [jukebox.id, songId],
  );

  const pendingTotal = Number(pendingRow?.total ?? 0);
  
  // Mettre à jour priority_weight pour refléter les priorités en attente réelles
  await pool.query(
    `UPDATE jukebox_songs js
     JOIN jukeboxes j ON js.jukebox_id = j.id
     SET js.priority_weight = ?
     WHERE j.slug = ? AND js.song_id = ?`,
    [pendingTotal, slug, songId],
  );

  // Si, après cette annulation, il ne reste plus aucune priorité en
  // attente pour cette chanson dans ce jukebox, on restaure la position
  // qu'elle avait avant la première priorité et on supprime le snapshot.
  if (pendingTotal <= 0.0001) {
    await restoreAndDeletePriorityOrderSnapshot({
      jukeboxId: jukebox.id,
      songId,
    });
  }

  await normalizeQueueOrdering(slug, { currentSongId });
  const playlist = await getPlaylist(slug);
  emitQueueUpdate({ slug, playlist });
  return playlist;
};

const getAllJukeboxes = async () => {
  try {
    const [rows] = await pool.query(
      'SELECT id, slug, name, location, avatar FROM jukeboxes ORDER BY name ASC'
    );
    
    // Vérifier le statut de connexion pour chaque jukebox
    const jukeboxes = rows.map((jukebox) => ({
      id: jukebox.id,
      slug: jukebox.slug,
      name: jukebox.name,
      location: jukebox.location ?? null,
      avatar: jukebox.avatar ?? null,
      isConnected: isJukeboxConnected(jukebox.slug),
    }));
    
    return jukeboxes;
  } catch (err) {
    // Si la colonne avatar n'existe pas encore, faire une requête sans elle
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      const [rows] = await pool.query(
        'SELECT id, slug, name, location FROM jukeboxes ORDER BY name ASC'
      );
      
      const jukeboxes = rows.map((jukebox) => ({
        id: jukebox.id,
        slug: jukebox.slug,
        name: jukebox.name,
        location: jukebox.location ?? null,
        avatar: null,
        isConnected: isJukeboxConnected(jukebox.slug),
      }));
      
      return jukeboxes;
    }
    throw err;
  }
};

const jukeboxService = {
  getJukeboxBySlug,
  getAllJukeboxes,
  getPlaylist,
  reloadPlaylist,
  prioritizeSong,
  completeSong,
  getCatalogForUser,
  updatePlaybackMode,
  addSongToJukebox,
  removeSongFromJukebox,
  addSongToJukeboxById,
  updateJukeboxLocation,
  previewPriorityForSong,
  listJukeboxLocations,
  skipToNext,
  skipToPrevious,
  cancelPriorityForSong,
};

module.exports = { jukeboxService };
