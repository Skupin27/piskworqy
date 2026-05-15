const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

const rooms   = {};  // code => { host: ws, guest: ws|null }
const clients = new Map(); // ws => { room: string|null, role: 'host'|'guest'|null }

const wss = new WebSocketServer({ port: PORT });
console.log(`Signaling server running on port ${PORT}`);

wss.on('connection', (ws) => {
  clients.set(ws, { room: null, role: null });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    handle(ws, msg);
  });

  ws.on('close', () => disconnect(ws));
  ws.on('error', () => disconnect(ws));
});

function handle(ws, msg) {
  const state = clients.get(ws);

  switch (msg.type) {
    case 'create': {
      let code;
      do { code = Math.random().toString(36).substring(2, 8).toUpperCase(); }
      while (rooms[code]);
      rooms[code] = { host: ws, guest: null };
      state.room = code;
      state.role = 'host';
      send(ws, { type: 'created', code });
      break;
    }
    case 'join': {
      const code = (msg.code || '').toUpperCase().trim();
      if (!rooms[code])           return send(ws, { type: 'error', reason: 'Room not found.' });
      if (rooms[code].guest)      return send(ws, { type: 'error', reason: 'Room is full.' });
      rooms[code].guest = ws;
      state.room = code;
      state.role = 'guest';
      send(rooms[code].host, { type: 'guest_joined' });
      send(ws, { type: 'joined', code });
      break;
    }
    case 'signal': {
      const other = peer(ws);
      if (other) send(other, { type: 'signal', payload: msg.payload });
      break;
    }
    case 'start_game': {
      const room = rooms[state.room];
      if (!room || ws !== room.host) return;
      if (room.guest) send(room.guest, { type: 'start_game', game: msg.game });
      break;
    }
  }
}

function peer(ws) {
  const { room, role } = clients.get(ws) || {};
  if (!room || !rooms[room]) return null;
  return role === 'host' ? rooms[room].guest : rooms[room].host;
}

function disconnect(ws) {
  const state = clients.get(ws);
  if (state?.room && rooms[state.room]) {
    const other = peer(ws);
    if (other) send(other, { type: 'peer_left' });
    if (state.role === 'host') delete rooms[state.room];
    else rooms[state.room].guest = null;
  }
  clients.delete(ws);
}

function send(ws, obj) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(obj));
}
