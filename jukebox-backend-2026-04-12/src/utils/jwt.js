const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const JWT_SECRET = env.JWT_SECRET || 'change-me-jwt-secret';
const JWT_EXPIRES_IN = '7d';

const signToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

module.exports = {
  signToken,
  verifyToken,
};



