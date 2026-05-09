const { Server } = require('socket.io');
const { pool } = require('../db/pool');
const getJukeboxService = () => require('../services/jukeboxService').jukeboxService;

let ioInstance = null;
let jukeboxNamespaceInstance = null;
const clientsByJukebox = new Map();

const emitPlaybackStart = ({ slug, track, startedAt }) => {
  if (!jukeboxNamespaceInstance) return;
  jukeboxNamespaceInstance.to(slug).emit('playback:start', {
    track,
    startedAt,
  });
};

const emitQueueUpdate = ({ slug, playlist }) => {
  if (!jukeboxNamespaceInstance) return;
  jukeboxNamespaceInstance.to(slug).emit('queue:update', { playlist });
};

const emitPlaylistState = async ({ slug }) => {
  if (!jukeboxNamespaceInstance) return;
  const playlist = await getJukeboxService().getPlaylist(slug);
  const activeTrack = playlist?.length ? playlist[0] : null;
  
  // Récupérer le mode de lecture et le device maître depuis la base de données
  let playbackMode = 'private';
  let masterSocketId = null;
  try {
    const [[jukeboxRow]] = await pool.query(
      'SELECT playback_mode, master_socket_id FROM jukeboxes WHERE slug = ? LIMIT 1',
      [slug],
    );
    if (jukeboxRow) {
      playbackMode = jukeboxRow.playback_mode ?? 'private';
      masterSocketId = jukeboxRow.master_socket_id ?? null;
    }
  } catch (err) {
    // Si les colonnes n'existent pas encore, utiliser les valeurs par défaut
    if (err.code !== 'ER_BAD_FIELD_ERROR') {
      // eslint-disable-next-line no-console
      console.warn('Erreur lors de la récupération du mode de lecture:', err);
    }
  }
  
  // Envoyer l'état à tous les clients dans la room
  // Chaque client déterminera s'il est maître en comparant son socket.id avec masterSocketId
  const roomClients = clientsByJukebox.get(slug);
  if (roomClients) {
    roomClients.forEach((socketId) => {
      const socket = jukeboxNamespaceInstance.sockets.get(socketId);
      if (socket) {
        const isMasterDevice = playbackMode === 'public' && masterSocketId === socketId;
        socket.emit('state:full', {
          activeTrackId: activeTrack?.id ?? null,
          playlist,
          playbackMode,
          isMasterDevice,
        });
      }
    });
  } else {
    // Si aucun client n'est dans la room, émettre quand même (pour les nouveaux clients)
    jukeboxNamespaceInstance.to(slug).emit('state:full', {
      activeTrackId: activeTrack?.id ?? null,
      playlist,
      playbackMode,
      isMasterDevice: false, // Par défaut, pas maître si aucun client n'est connecté
    });
  }
};

const registerJukeboxSockets = (httpServer) => {
  const { env } = require('../config/env');
  const allowedOrigins = env.CLIENT_ORIGINS ?? [env.CLIENT_URL];
  
  const io = new Server(httpServer, {
    path: '/api/socket.io',
    cors: {
      origin: (origin, callback) => {
        // Permettre les connexions sans origin (ex: Postman, apps natives)
        if (!origin) {
          return callback(null, true);
        }
        
        // Vérifier si l'origine correspond exactement ou commence par une origine autorisée
        const isAllowed = allowedOrigins.some((allowed) => {
          // Correspondance exacte
          if (origin === allowed) return true;
          // Vérifier si l'origine commence par l'URL autorisée (pour les sous-domaines)
          if (origin.startsWith(allowed + '/') || origin.startsWith(allowed + ':')) return true;
          return false;
        });
        
        if (isAllowed) {
          return callback(null, true);
        }
        
        // eslint-disable-next-line no-console
        console.warn('[Socket.io CORS] Blocked origin:', origin, 'Allowed:', allowedOrigins);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['polling', 'websocket'], // Support WebSocket et polling
    allowUpgrades: true, // Permettre l'upgrade vers WebSocket
  });
  ioInstance = io;
  jukeboxNamespaceInstance = io.of('/ws/jukebox');

  // eslint-disable-next-line no-console
  console.log('[Socket.io] Server initialized');
  // eslint-disable-next-line no-console
  console.log('[Socket.io] Path:', '/api/socket.io');
  // eslint-disable-next-line no-console
  console.log('[Socket.io] Namespace:', '/ws/jukebox');
  // eslint-disable-next-line no-console
  console.log('[Socket.io] Allowed origins:', allowedOrigins);

  jukeboxNamespaceInstance.on('connection', (socket) => {
    // eslint-disable-next-line no-console
    console.log('[Socket.io] Client connected:', socket.id);
    socket.on('join', async ({ slug, requestMaster = false }) => {
      if (!slug) {
        return;
      }
      socket.join(slug);
      const roomClients = clientsByJukebox.get(slug) ?? new Set();
      roomClients.add(socket.id);
      clientsByJukebox.set(slug, roomClients);

      // Gérer le device maître
      let playback_mode = 'private';
      let master_socket_id = null;
      let isMaster = false;

      try {
        const [[jukeboxRow]] = await pool.query(
          'SELECT id, playback_mode, master_socket_id FROM jukeboxes WHERE slug = ? LIMIT 1',
          [slug],
        );

        if (jukeboxRow) {
          playback_mode = jukeboxRow.playback_mode ?? 'private';
          master_socket_id = jukeboxRow.master_socket_id ?? null;

          // En mode public, gérer le device maître
          if (playback_mode === 'public') {
            // Vérifier si le socket maître actuel est toujours connecté
            if (master_socket_id) {
              const masterSocket = jukeboxNamespaceInstance.sockets.get(master_socket_id);
              if (!masterSocket) {
                // Le maître précédent s'est déconnecté, libérer la place
                try {
                  await pool.query(
                    'UPDATE jukeboxes SET master_socket_id = NULL WHERE slug = ?',
                    [slug],
                  );
                } catch (err) {
                  // Colonne n'existe pas encore, ignorer
                  if (err.code !== 'ER_BAD_FIELD_ERROR') {
                    throw err;
                  }
                }
                // Réinitialiser master_socket_id pour la suite
                master_socket_id = null;
              }
            }

            // Si aucun maître n'existe ou si ce socket demande explicitement d'être maître
            if (!master_socket_id || requestMaster) {
              try {
                await pool.query(
                  'UPDATE jukeboxes SET master_socket_id = ? WHERE slug = ?',
                  [socket.id, slug],
                );
                isMaster = true;
              } catch (err) {
                // Colonne n'existe pas encore, ignorer
                if (err.code !== 'ER_BAD_FIELD_ERROR') {
                  throw err;
                }
              }
            } else {
              // Vérifier si ce socket est le maître actuel
              isMaster = master_socket_id === socket.id;
            }
          } else {
            // En mode privé, pas de distinction maître/client
            isMaster = false;
          }
        }
      } catch (err) {
        // Si les colonnes n'existent pas encore, utiliser les valeurs par défaut
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          playback_mode = 'private';
          master_socket_id = null;
          isMaster = false;
        } else {
          throw err;
        }
      }

      const playlist = await getJukeboxService().getPlaylist(slug);
      const activeTrack = playlist?.length ? playlist[0] : null;
      socket.emit('state:full', {
        activeTrackId: activeTrack?.id ?? null,
        playlist,
        playbackMode: playback_mode,
        isMasterDevice: isMaster,
      });
    });

    socket.on('disconnect', async () => {
      // eslint-disable-next-line no-console
      console.log('[Socket.io] Client disconnected:', socket.id);
      // Si ce socket était le device maître, libérer la place
      try {
        await pool.query(
          'UPDATE jukeboxes SET master_socket_id = NULL WHERE master_socket_id = ?',
          [socket.id],
        );
      } catch (err) {
        // Colonne n'existe pas encore, ignorer
        if (err.code !== 'ER_BAD_FIELD_ERROR') {
          console.error('Error clearing master socket on disconnect:', err);
        }
      }

      clientsByJukebox.forEach((roomClients, slug) => {
        if (roomClients.has(socket.id)) {
          roomClients.delete(socket.id);
          if (!roomClients.size) {
            clientsByJukebox.delete(slug);
          } else {
            clientsByJukebox.set(slug, roomClients);
          }
        }
      });
    });
  });
};

const getConnectedJukeboxes = () => {
  return Array.from(clientsByJukebox.keys());
};

const isJukeboxConnected = (slug) => {
  const clients = clientsByJukebox.get(slug);
  return clients ? clients.size > 0 : false;
};

module.exports = {
  registerJukeboxSockets,
  emitPlaybackStart,
  emitQueueUpdate,
  emitPlaylistState,
  getConnectedJukeboxes,
  isJukeboxConnected,
};

