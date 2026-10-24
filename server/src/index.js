const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const { PigRoom } = require('./PigRoom');

const port = Number(process.env.PORT || 2567);

// In production the server also hands out the built game (client/dist), so one address serves everything.
const DIST = path.resolve(__dirname, '../../client/dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
};

function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Pull The Pig game server is running. (No game build found: run "npm run build" to serve the game from here.)\n');
    return;
  }
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const file = path.resolve(DIST, '.' + urlPath);
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : path.join(DIST, 'index.html');
    const ext = path.extname(target);
    const cache = target.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': cache });
    fs.createReadStream(target).pipe(res);
  });
}

const httpServer = http.createServer(serveStatic);

const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer, pingInterval: 5000 }) });
gameServer.define('pig', PigRoom).filterBy(['map']); // one set of rooms per map

gameServer.listen(port).then(() => {
  console.log(`Pull The Pig server listening on ws://localhost:${port}`);
  if (fs.existsSync(DIST)) console.log(`Serving the game at http://localhost:${port}`);
});
