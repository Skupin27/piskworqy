const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

// rooms[roomId] = { players: [socketId, socketId], board, turn, started, scores }
const rooms = {};

const BOARD_SIZE = 15;
const WIN_COUNT = 5;

function makeBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function checkWin(board, row, col, player) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let d = 1; d < WIN_COUNT; d++) {
      const r = row + dr*d, c = col + dc*d;
      if (r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==player) break;
      count++;
    }
    for (let d = 1; d < WIN_COUNT; d++) {
      const r = row - dr*d, c = col - dc*d;
      if (r<0||r>=BOARD_SIZE||c<0||c>=BOARD_SIZE||board[r][c]!==player) break;
      count++;
    }
    if (count >= WIN_COUNT) return true;
  }
  return false;
}

function isBoardFull(board) {
  return board.every(row => row.every(cell => cell !== null));
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ roomId, nickname }) => {
    if (rooms[roomId]) {
      socket.emit("error_msg", "Room already exists.");
      return;
    }
    rooms[roomId] = {
      players: [{ id: socket.id, nickname }],
      board: makeBoard(),
      turn: 0,
      started: false,
      scores: [0, 0],
    };
    socket.join(roomId);
    socket.emit("room_joined", { roomId, playerIndex: 0, nickname });
    socket.emit("waiting", "Waiting for opponent…");
  });

  socket.on("join_room", ({ roomId, nickname }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit("error_msg", "Room not found."); return; }
    if (room.players.length >= 2) { socket.emit("error_msg", "Room is full."); return; }
    room.players.push({ id: socket.id, nickname });
    socket.join(roomId);
    socket.emit("room_joined", { roomId, playerIndex: 1, nickname });

    room.started = true;
    io.to(roomId).emit("game_start", {
      players: room.players.map(p => p.nickname),
      board: room.board,
      turn: room.turn,
      scores: room.scores,
    });
  });

  socket.on("place_stone", ({ roomId, row, col }) => {
    const room = rooms[roomId];
    if (!room || !room.started) return;

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== room.turn) return;
    if (room.board[row][col] !== null) return;

    const player = playerIndex === 0 ? "black" : "white";
    room.board[row][col] = player;

    if (checkWin(room.board, row, col, player)) {
      room.scores[playerIndex]++;
      io.to(roomId).emit("game_over", {
        board: room.board,
        winner: playerIndex,
        winnerName: room.players[playerIndex].nickname,
        scores: room.scores,
      });
      room.board = makeBoard();
      room.turn = playerIndex === 0 ? 1 : 0; // loser goes first next round
      room.started = true;
    } else if (isBoardFull(room.board)) {
      io.to(roomId).emit("game_draw", { board: room.board, scores: room.scores });
      room.board = makeBoard();
      room.turn = 1 - room.turn;
    } else {
      room.turn = 1 - room.turn;
      io.to(roomId).emit("board_update", { board: room.board, turn: room.turn });
    }
  });

  socket.on("rematch", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.board = makeBoard();
    room.started = true;
    io.to(roomId).emit("game_start", {
      players: room.players.map(p => p.nickname),
      board: room.board,
      turn: room.turn,
      scores: room.scores,
    });
  });

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      const room = rooms[roomId];
      if (!room) continue;
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      } else {
        room.started = false;
        io.to(roomId).emit("opponent_left");
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Gomoku server running on port ${PORT}`));
