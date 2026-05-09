const http = require('http');
const { app } = require('./app');
const { env } = require('./config/env');
const { registerJukeboxSockets } = require('./ws/jukeboxSockets');
const path = require('path');
const fs = require('fs/promises');

// Créer les dossiers media au démarrage
const ensureMediaDirectories = async () => {
  const mediaDir = path.join(__dirname, '..', '..', 'media');
  const audioDir = path.join(mediaDir, 'audio');
  const imageDir = path.join(mediaDir, 'images');
  
  try {
    await fs.mkdir(audioDir, { recursive: true });
    await fs.mkdir(imageDir, { recursive: true });
    console.log('[Server] ✅ Dossiers media créés:', { mediaDir, audioDir, imageDir });
  } catch (error) {
    console.error('[Server] ❌ Erreur lors de la création des dossiers media:', error);
  }
};

const server = http.createServer(app);

registerJukeboxSockets(server);

// Créer les dossiers avant de démarrer le serveur
ensureMediaDirectories().then(() => {
  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`PlaceJukebox backend running on port ${env.PORT}`);
  });
});

module.exports = { server };



