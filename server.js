const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
});

const PORT = process.env.PORT || 5000;

const createRoom = (msg) => {
  return {
    roomCode: msg.roomCode,
    maxPlayers: msg.maxPlayers,
    rounds: msg.rounds,
    timeLimit: msg.timeLimit,
    players: [],
    chats: [],
  };
};

const createPlayer = (msg, socket, isAdmin) => {
  return {
    playerid: socket.id,
    name: msg.name,
    avatar: msg.avatar,
    isAdmin: isAdmin,
    score: 0,
  };
};

let rooms = [];

io.on("connection", (socket) => {
  console.log("Client connected with socket id : ", socket.id);
  socket.on("create-room", (msg) => {
    let room = createRoom(msg);
    let player = createPlayer(msg, socket, true);
    room.players.push(player);
    rooms.push(room);
    console.log(room.roomCode);
    socket.join(room.roomCode);
    io.to(room.roomCode).emit("player-joined", room.players);
  });
  socket.on("join-room", (msg) => {
    let room = rooms.find((room) => {
      return room.roomCode === msg.roomCode;
    });
    let player = createPlayer(msg, socket, false);
    room.players.push(player);
    socket.join(room.roomCode);
    io.to(room.roomCode).emit("player-joined", room.players);
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
