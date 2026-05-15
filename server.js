const { PeerServer } = require('peer');

const PORT = process.env.PORT || 9000;

const server = PeerServer({
  port: PORT,
  path: '/peerjs',
  allow_discovery: true,
});

server.on('connection', (client) => {
  console.log('Client connected:', client.getId());
});

server.on('disconnect', (client) => {
  console.log('Client disconnected:', client.getId());
});

console.log(`PeerJS server running on port ${PORT} at /peerjs`);
