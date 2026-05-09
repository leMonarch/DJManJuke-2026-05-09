const ensurePlayableQueue = (songs = []) => {
  if (!songs.length) {
    return songs;
  }
  return songs.sort((a, b) => a.order_id - b.order_id);
};

const reload = (playlist) => ensurePlayableQueue(playlist);

const playlistLogic = {
  ensurePlayableQueue,
  reload,
};

module.exports = { playlistLogic };
