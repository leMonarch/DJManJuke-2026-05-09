const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { env } = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const apiRouter = require('./routes');

const app = express();

const allowedOrigins = env.CLIENT_ORIGINS ?? [env.CLIENT_URL];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Servir les assets statiques (images et audio)
// Les fichiers sont stockés dans DJManJuke/media/ à la racine du projet
// __dirname = backend/src
// .. = backend
// .. = DJManJuke
// media = DJManJuke/media
const mediaDir = path.join(__dirname, '..', '..', 'media');

// Les assets sont accessibles via /media/images/ et /media/audio/
// Note: Avec PassengerBaseURI "/api", ces routes sont accessibles via /api/media/...
// Mais si Apache sert directement /media/, ils sont aussi accessibles sans /api
app.use('/media/images', express.static(path.join(mediaDir, 'images'), {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.use('/media/audio', express.static(path.join(mediaDir, 'audio'), {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Accept-Ranges', 'bytes'); // Important pour la lecture audio/vidéo
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
// Support aussi pour /api/media/ si nécessaire (pour compatibilité)
app.use('/api/media/images', express.static(path.join(mediaDir, 'images'), {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.use('/api/media/audio', express.static(path.join(mediaDir, 'audio'), {
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.set('Accept-Ranges', 'bytes'); // Important pour la lecture audio/vidéo
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));

// L'application est dans /public_html/api/, accessible via djmanjuke.com/api/
// Sur cPanel, le proxy envoie le préfixe /api, donc on supporte les deux formats
// Exemple: djmanjuke.com/api/auth (cPanel) et localhost:4000/auth (dev local)
app.use('/api', apiRouter); // Pour cPanel (avec préfixe /api)
app.use('/', apiRouter); // Pour développement local (sans préfixe)

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };


