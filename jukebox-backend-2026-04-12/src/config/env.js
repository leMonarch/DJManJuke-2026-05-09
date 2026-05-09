const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
});

const parseOrigins = (value) =>
  (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
// URLs par défaut (utilisées seulement si CLIENT_ORIGINS n'est pas défini dans .env)
// Pour la production, configurez CLIENT_ORIGINS dans cPanel avec votre URL Vercel de production
const defaultOrigins = 'https://djman-mini-frontend-bw8k.vercel.app,https://djman-mini-prod-gn38.vercel.app,https://djmanjuke.com';
const explicitOrigins = process.env.CLIENT_ORIGINS
  ? parseOrigins(process.env.CLIENT_ORIGINS)
  : parseOrigins(defaultOrigins);
const isNonProduction = (process.env.NODE_ENV || 'development') !== 'production';
const localDevOrigins = isNonProduction
  ? ['http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']
  : [];
// Toujours autoriser CLIENT_URL + variantes locales courantes, en plus des origines prod / .env
const clientOrigins = Array.from(
  new Set([clientUrl, ...localDevOrigins, ...explicitOrigins].filter(Boolean)),
);

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 4000,
  CLIENT_URL: clientUrl,
  CLIENT_ORIGINS: clientOrigins.length ? clientOrigins : [clientUrl],
  APP_BASE_URL: process.env.APP_BASE_URL || clientUrl,
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-me',
  JWT_SECRET: process.env.JWT_SECRET || 'change-me-jwt',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: parseInt(process.env.DB_PORT, 10) || 3306,
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'place_jukebox',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_CONNECT_CLIENT_ID: process.env.STRIPE_CONNECT_CLIENT_ID || '',
  STRIPE_PLATFORM_ACCOUNT_ID: process.env.STRIPE_PLATFORM_ACCOUNT_ID || '',
  STRIPE_DEFAULT_CURRENCY: process.env.STRIPE_DEFAULT_CURRENCY || 'cad',
  STRIPE_CONNECT_DEFAULT_COUNTRY: process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'CA',
  MIN_PAYOUT_AMOUNT: parseInt(process.env.MIN_PAYOUT_AMOUNT, 10) || 5,
  GEOCODING_BASE_URL: process.env.GEOCODING_BASE_URL || '',
  PLATFORM_USER_EMAIL: process.env.PLATFORM_USER_EMAIL || 'louis.lemonarch@gmail.com',
  ANONYMOUS_PAYER_EMAIL:
    process.env.ANONYMOUS_PAYER_EMAIL ||
    process.env.PLATFORM_USER_EMAIL ||
    'djmanjuke@placejukebox.dev',
  STRIPE_PRO_PRICE_ID: process.env.STRIPE_PRO_PRICE_ID || '',
};

module.exports = { env };


