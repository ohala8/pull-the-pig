const http = require('http');
const { Server } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const { PigRoom } = require('./PigRoom');

const port = Number(process.env.PORT || 2567);

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Pull The Pig game server is running.\n');
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('pig', PigRoom);

gameServer.listen(port).then(() => {
  console.log(`Pull The Pig server listening on ws://localhost:${port}`);
});
