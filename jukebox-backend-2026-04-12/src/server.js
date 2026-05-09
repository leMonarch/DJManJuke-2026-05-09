const http = require('http');
const { app } = require('./app');
const { env } = require('./config/env');
const { registerJukeboxSockets } = require('./ws/jukeboxSockets');

const server = http.createServer(app);

registerJukeboxSockets(server);

server.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PlaceJukebox backend running on port ${env.PORT}`);
});

module.exports = { server };



