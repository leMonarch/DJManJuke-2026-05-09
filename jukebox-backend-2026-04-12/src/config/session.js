const session = require('express-session');

const sessionConfig = {
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24,
  },
  store: undefined,
  name: 'placejukebox.sid',
};

const configureSessionStore = (store) => {
  sessionConfig.store = store;
  return session(sessionConfig);
};

module.exports = {
  sessionConfig,
  configureSessionStore,
};


