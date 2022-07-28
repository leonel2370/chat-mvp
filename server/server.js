require('dotenv').config();

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');

const isProduction = process.env.NODE_ENV === 'production';

// --- Journalisation horodatée à niveaux (sortie standard, captée par l'hébergeur) ---
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const LOG_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(level, message, meta) {
  if (LEVELS[level] > LOG_LEVEL) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`
    + (meta ? ` ${JSON.stringify(meta)}` : '');
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

// Origines autorisées, séparées par des virgules (ex. "https://chat.onrender.com").
// En production, CLIENT_ORIGIN est obligatoire pour ne pas laisser la CORS ouverte à tous.
if (isProduction && !process.env.CLIENT_ORIGIN) {
  log('error', 'CLIENT_ORIGIN est obligatoire en production. Arrêt.');
  process.exit(1);
}
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
  : '*';

// Mot de passe du tableau de bord : obligatoire en production.
if (isProduction && !process.env.ADMIN_PASSWORD) {
  log('error', 'ADMIN_PASSWORD est obligatoire en production. Arrêt.');
  process.exit(1);
}
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
if (!process.env.ADMIN_PASSWORD) {
  log('warn', 'ADMIN_PASSWORD non défini : mot de passe "admin" (développement uniquement).');
}

const app = express();
app.use(cors({ origin: allowedOrigins }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// File d'attente des utilisateurs en recherche d'un partenaire
let waitingQueue = [];
// Derniers signalements (du plus récent au plus ancien), limités à 50
let reports = [];
// Suivi des tentatives d'authentification admin par adresse IP (anti-force brute)
const adminAuthAttempts = new Map();
const MAX_ADMIN_ATTEMPTS = 5;
const ADMIN_LOCK_MS = 15 * 60 * 1000; // 15 minutes

const shortId = (id) => id.slice(0, 4);

function removeFromQueue(sock) {
  waitingQueue = waitingQueue.filter((s) => s.id !== sock.id);
}

// Limitation de fréquence par socket : renvoie false si l'action est trop rapprochée
function throttle(sock, key, minIntervalMs) {
  const now = Date.now();
  if (!sock.lastAction) sock.lastAction = {};
  const last = sock.lastAction[key] || 0;
  if (now - last < minIntervalMs) return false;
  sock.lastAction[key] = now;
  return true;
}

// État transmis au tableau de bord d'administration (aucune image, aucun son)
function getState() {
  const participants = [...io.sockets.sockets.values()].filter((s) => !s.isAdmin);
  const seen = new Set();
  const sessions = [];

  for (const s of participants) {
    if (s.partner && !seen.has(s.id) && !seen.has(s.partner.id)) {
      seen.add(s.id);
      seen.add(s.partner.id);
      sessions.push({
        aId: s.id,
        bId: s.partner.id,
        a: shortId(s.id),
        b: shortId(s.partner.id),
        startedAt: s.sessionStartedAt || Date.now()
      });
    }
  }

  return {
    online: participants.length,
    queue: waitingQueue.length,
    sessions,
    reports
  };
}

function broadcastStats() {
  const state = getState();
  for (const s of io.sockets.sockets.values()) {
    if (s.isAdmin) s.emit('admin-stats', state);
  }
}

function findPartner(sock) {
  if (sock.partner || waitingQueue.includes(sock)) return;

  // Éviter de retomber immédiatement sur le partenaire que l'on vient de quitter
  const partnerSocket = waitingQueue.find(
    (s) => s.connected && s.id !== sock.lastPartnerId && s.lastPartnerId !== sock.id
  );

  if (partnerSocket) {
    removeFromQueue(partnerSocket);

    // Associer les deux sockets
    sock.partner = partnerSocket;
    partnerSocket.partner = sock;
    const startedAt = Date.now();
    sock.sessionStartedAt = startedAt;
    partnerSocket.sessionStartedAt = startedAt;

    // Informer les deux utilisateurs
    sock.emit('matched', { initiator: true });
    partnerSocket.emit('matched', { initiator: false });
    log('info', 'Mise en relation', { a: shortId(sock.id), b: shortId(partnerSocket.id) });
  } else {
    waitingQueue.push(sock);
    sock.emit('waiting');
    log('debug', 'En attente', { id: shortId(sock.id), queue: waitingQueue.length });
  }
  broadcastStats();
}

function disconnectPartner(sock) {
  const partner = sock.partner;
  if (!partner) return;

  sock.lastPartnerId = partner.id;
  partner.lastPartnerId = sock.id;
  partner.partner = null;
  sock.partner = null;
  sock.sessionStartedAt = null;
  partner.sessionStartedAt = null;
  partner.emit('partner-disconnected');
}

io.on('connection', (socket) => {
  socket.termsAccepted = false;

  const clientIp = socket.handshake.address;
  log('info', 'Connexion', { id: shortId(socket.id), ip: clientIp });

  // Acceptation des conditions, vérifiée côté serveur (pas seulement dans le navigateur)
  socket.on('accept-terms', () => {
    socket.termsAccepted = true;
  });

  // --- Authentification du tableau de bord d'administration (anti-force brute) ---
  socket.on('admin-auth', (password, ack) => {
    const record = adminAuthAttempts.get(clientIp);
    if (record && record.lockedUntil > Date.now()) {
      log('warn', 'Tentative admin pendant verrou', { ip: clientIp });
      if (typeof ack === 'function') ack({ ok: false, locked: true });
      return;
    }

    const ok = password === ADMIN_PASSWORD;
    if (ok) {
      adminAuthAttempts.delete(clientIp);
      socket.isAdmin = true;
      removeFromQueue(socket);
      disconnectPartner(socket);
      log('info', 'Admin authentifié', { ip: clientIp });
    } else {
      const count = (record?.count || 0) + 1;
      const lockedUntil = count >= MAX_ADMIN_ATTEMPTS ? Date.now() + ADMIN_LOCK_MS : 0;
      adminAuthAttempts.set(clientIp, { count, lockedUntil });
      log('warn', 'Échec authentification admin', { ip: clientIp, count, locked: lockedUntil > 0 });
    }

    if (typeof ack === 'function') ack({ ok });
    if (ok) socket.emit('admin-stats', getState());
  });

  // --- Matchmaking (participants ayant accepté les conditions) ---
  socket.on('find-partner', () => {
    if (socket.isAdmin || !socket.termsAccepted) return;
    if (!throttle(socket, 'find', 1000)) return;
    findPartner(socket);
  });

  // Signalisation WebRTC entre partenaires
  socket.on('signal', (data) => {
    if (socket.partner) {
      socket.partner.emit('signal', data);
    }
  });

  // Passer à la personne suivante
  socket.on('next-partner', () => {
    if (socket.isAdmin) return;
    if (!throttle(socket, 'next', 1000)) return;
    disconnectPartner(socket);
    findPartner(socket);
  });

  // Quitter : mettre fin à la session et sortir de la file sans nouvelle recherche
  socket.on('leave', () => {
    if (socket.isAdmin) return;
    removeFromQueue(socket);
    disconnectPartner(socket);
    broadcastStats();
  });

  // Signalement d'un partenaire par un participant
  socket.on('report', (reason) => {
    const partner = socket.partner;
    if (!partner) return;
    if (!throttle(socket, 'report', 5000)) return;
    reports.unshift({
      id: `${Date.now()}-${socket.id}`,
      reporter: shortId(socket.id),
      reported: shortId(partner.id),
      reportedId: partner.id,
      reason: typeof reason === 'string' ? reason.slice(0, 200) : '',
      at: Date.now()
    });
    reports = reports.slice(0, 50);
    log('warn', 'Signalement', { reporter: shortId(socket.id), reported: shortId(partner.id) });
    broadcastStats();
  });

  // --- Déconnexion ---
  socket.on('disconnect', (reason) => {
    log('info', 'Déconnexion', { id: shortId(socket.id), reason });
    removeFromQueue(socket);
    disconnectPartner(socket);
    broadcastStats();
  });
});

app.get('/', (req, res) => {
  res.send('Serveur CHAT actif');
});

// Identifiants TURN éphémères (spec REST coturn). Inactif sans TURN_SECRET / TURN_URLS.
app.get('/turn-credentials', (req, res) => {
  const secret = process.env.TURN_SECRET;
  const urls = process.env.TURN_URLS;
  if (!secret || !urls) {
    return res.json({ iceServers: [] });
  }
  const ttl = 3600; // durée de vie : 1 heure
  const username = String(Math.floor(Date.now() / 1000) + ttl);
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  res.json({
    iceServers: [
      {
        urls: urls.split(',').map((u) => u.trim()),
        username,
        credential
      }
    ]
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  log('info', 'Serveur démarré', {
    port: Number(PORT),
    env: isProduction ? 'production' : 'development',
    cors: Array.isArray(allowedOrigins) ? allowedOrigins : 'ouvert (*)'
  });
});

// Journaliser les erreurs non interceptées plutôt que de planter silencieusement
process.on('uncaughtException', (err) => log('error', 'uncaughtException', { message: err.message }));
process.on('unhandledRejection', (reason) => log('error', 'unhandledRejection', { reason: String(reason) }));
