// DEAD ZONE — authoritative multiplayer server.
//
// Serves the static client (public/ and shared/) and runs a WebSocket endpoint
// on the same HTTP server/port. The server owns the entire simulation for a
// room (zombie AI, waves, bullet collision, hit points) — clients only ever
// send input (movement/aim/fire) and one-shot actions (reload/buy/pickup/reset),
// never gameplay state, so a client can't cheat by lying about a kill or a
// pickup and can't desync the world for everyone else in the room.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGameState, applyInput, applyAction, stepSim } from '../shared/sim.js';
import { MAX_PLAYERS } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');

const PORT = process.env.PORT || 3000;
const TICK_MS = 50; // 20Hz authoritative tick
const NAME_MAX = 12;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const isShared = urlPath.startsWith('/shared/');
  const base = isShared ? SHARED_DIR : PUBLIC_DIR;
  const rel = isShared ? urlPath.slice('/shared/'.length) : (urlPath === '/' ? 'index.html' : urlPath.slice(1));
  const filePath = path.normalize(path.join(base, rel));

  // Prevent path traversal outside the intended directory.
  const relCheck = path.relative(base, filePath);
  if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(serveStatic);
// maxPayload caps a single WS frame well above anything our protocol ever
// sends (largest legitimate message is a full room state broadcast), so a
// client can't force the process to buffer an arbitrarily large message.
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

/** @type {Map<string, Room>} */
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

function genRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function safeName(raw, fallback) {
  const n = String(raw ?? '').trim().slice(0, NAME_MAX);
  return n || fallback;
}

class Room {
  constructor(code) {
    this.code = code;
    this.clients = []; // { ws, name, index }
    this.gs = null;
    this.started = false;
    this.interval = null;
  }

  broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const c of this.clients) if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.gs = createGameState(this.clients.map(c => c.name));
    this.broadcast({ type: 'startGame' });
    this.interval = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    stepSim(this.gs, TICK_MS / 1000);
    const events = this.gs.events.splice(0);
    this.broadcast({ type: 'state', state: this.gs, events });
    if (this.gs.gameOver) { clearInterval(this.interval); this.interval = null; }
  }

  removeClient(ws) {
    const i = this.clients.findIndex(c => c.ws === ws);
    if (i === -1) return;
    const [c] = this.clients.splice(i, 1);
    if (this.gs && this.gs.players[c.index]) {
      const p = this.gs.players[c.index];
      p.alive = false; p.isDead = true; p.lives = 0; p.respTimer = 0;
    }
    this.broadcast({ type: 'playerLeft', index: c.index, playerCount: this.clients.length });
    if (this.clients.length === 0) {
      if (this.interval) clearInterval(this.interval);
      rooms.delete(this.code);
    }
  }
}

wss.on('connection', ws => {
  let room = null;
  let myIndex = -1;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    // A connection may only ever belong to one room. Without this, a client
    // (malicious or just buggy) sending repeated create/join on the same
    // socket would orphan earlier rooms forever — close/removeClient only
    // ever knows about whichever room `room` currently points to.
    if (room && (msg.type === 'create' || msg.type === 'join')) return;

    switch (msg.type) {
      case 'create': {
        const code = genRoomCode();
        room = new Room(code);
        rooms.set(code, room);
        myIndex = 0;
        room.clients.push({ ws, name: safeName(msg.name, 'Host'), index: myIndex });
        ws.send(JSON.stringify({ type: 'created', code, index: myIndex }));
        break;
      }
      case 'join': {
        const r = rooms.get(String(msg.code || '').toUpperCase());
        if (!r) { ws.send(JSON.stringify({ type: 'error', msg: 'Stanza non trovata' })); return; }
        if (r.started) { ws.send(JSON.stringify({ type: 'error', msg: 'Partita già iniziata' })); return; }
        if (r.clients.length >= MAX_PLAYERS) { ws.send(JSON.stringify({ type: 'error', msg: 'Stanza piena' })); return; }
        room = r;
        myIndex = r.clients.length;
        const name = safeName(msg.name, 'Player');
        r.clients.push({ ws, name, index: myIndex });
        ws.send(JSON.stringify({ type: 'joined', index: myIndex }));
        r.broadcast({ type: 'playerJoined', name, playerCount: r.clients.length });
        break;
      }
      case 'startGame': {
        if (room && room.clients[0] && room.clients[0].ws === ws) room.start();
        break;
      }
      case 'input': {
        if (room && room.gs && room.gs.players[myIndex]) applyInput(room.gs.players[myIndex], msg);
        break;
      }
      case 'action': {
        if (room && room.gs && room.gs.players[myIndex]) applyAction(room.gs, room.gs.players[myIndex], msg.action);
        break;
      }
    }
  });

  ws.on('close', () => { if (room) room.removeClient(ws); });
  ws.on('error', () => { if (room) room.removeClient(ws); });
});

server.listen(PORT, () => console.log('DEAD ZONE server listening on :' + PORT));

// Most hosts (Render, Railway, Fly, Docker/k8s...) send SIGTERM before
// killing the process on redeploy — close cleanly instead of letting every
// connected player's socket die with a raw ECONNRESET.
function shutdown() {
  console.log('Shutting down...');
  for (const room of rooms.values()) {
    if (room.interval) clearInterval(room.interval);
    room.broadcast({ type: 'shutdown' });
  }
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
