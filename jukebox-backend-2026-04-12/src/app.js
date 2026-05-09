const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const { env } = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandlers');
const apiRouter = require('./routes');

const app = express();

const allowedOrigins = env.CLIENT_ORIGINS ?? [env.CLIENT_URL];

// Log pour debug (à retirer en production si nécessaire)
console.log('[CORS] Allowed origins:', allowedOrigins);

// Fonction helper pour vérifier si une origine est autorisée
const isOriginAllowed = (origin) => {
  if (!origin) return true; // Permettre les requêtes sans origin
  if (!Array.isArray(allowedOrigins)) return false;
  return allowedOrigins.includes(origin);
};

// Middleware CORS manuel AVANT cors() pour garantir que les requêtes OPTIONS sont traitées
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Répondre aux requêtes OPTIONS (preflight) immédiatement
  if (req.method === 'OPTIONS') {
    if (origin && isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 heures
      return res.status(204).end();
    } else {
      console.warn('[CORS] OPTIONS request blocked for origin:', origin);
      return res.status(403).end();
    }
  }
  
  // Pour les autres requêtes, ajouter les en-têtes CORS
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Authorization');
  }
  
  next();
});

// Middleware CORS principal (double sécurité)
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      console.warn('[CORS] Blocked origin:', origin, 'Allowed:', allowedOrigins);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques (images et audio)
// Les fichiers sont dans media/ (api/media/) au même niveau que src/
// __dirname = src/, donc on remonte d'un niveau pour accéder à media/
const mediaImagesPath = path.join(__dirname, '..', 'media', 'images');
const mediaAudioPath = path.join(__dirname, '..', 'media', 'audio');

// Avec PassengerBaseURI "/api", Passenger enlève /api avant d'envoyer à Node.js
// Donc /api/media/images devient /media/images dans Node.js
// Pour cPanel : accessible via djmanjuke.com/api/media/images/...
// Pour développement local : accessible via localhost:4000/media/images/...
app.use('/media/images', express.static(mediaImagesPath));
app.use('/media/audio', express.static(mediaAudioPath));

// L'application est dans /public_html/api/, accessible via djmanjuke.com/api/
// Support des deux cas :
// 1. Si PassengerBaseURI retire /api : Node.js reçoit /auth/login
// 2. Si PassengerBaseURI garde /api : Node.js reçoit /api/auth/login
// Pour développement local : localhost:4000/auth/login (sans préfixe)
app.use('/api', apiRouter); // Pour cPanel si Passenger garde /api
app.use('/', apiRouter); // Pour cPanel si Passenger retire /api ET pour dev local

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };


