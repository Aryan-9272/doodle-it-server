const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
});

const { chatColors } = require("./constants");

const PORT = process.env.PORT || 5000;

const createRoom = (msg) => {
  return {
    roomCode: msg.roomCode,
    maxPlayers: msg.maxPlayers,
    rounds: msg.rounds,
    currRound: 1,
    timeLimit: msg.timeLimit,
    startTime: 5 * 60,
    players: [],
    chatColors: [...chatColors],
  };
};

const createPlayer = (msg, socket, isAdmin, color) => {
  return {
    playerid: socket.id,
    name: msg.name,
    avatar: msg.avatar,
    isAdmin: isAdmin,
    score: 0,
    color: color,
    isReady: false,
  };
};

const chooseColor = (chatColors) => {
  const index = Math.floor(Math.random() * chatColors.length);
  const color = chatColors[index];
  chatColors.splice(index, 1);
  return color;
};

const checkAllReady = (players) => {
  let count = 0;
  for (let i = 0; i < players.length; i++) {
    if (players[i].isReady == true) count++;
  }
  return count === players.length ? true : false;
};

let rooms = [];

io.on("connection", (socket) => {
  socket.on("create-room", (msg) => {
    let room = createRoom(msg);
    let color = chooseColor(room.chatColors);
    let player = createPlayer(msg, socket, true, color);
    room.players.push(player);
    rooms.push(room);
    socket.join(room.roomCode);
    io.to(room.roomCode).emit(
      "player-joined",
      ({ roomCode, rounds, currRound, timeLimit, startTime } = room)
    );
    io.to(room.roomCode).emit("player-list-update", room.players);
    io.to(room.roomCode).emit("chat-to-client", {
      senderID: "SYSTEM_MSG",
      chatMsg: `${player.name} has joined the game.`,
      color: "lime",
    });
    const interval = setInterval(() => {
      if (room.startTime > 0) room.startTime--;
      io.to(room.roomCode).emit("round-timer-update", room.startTime);
      if (room.startTime == 0) clearInterval(interval);
    }, 1000);
  });

  socket.on("join-room", (msg) => {
    let room = rooms.find((room) => {
      return room.roomCode === msg.roomCode;
    });
    let color = chooseColor(room.chatColors);
    let player = createPlayer(msg, socket, false, color);
    room.players.push(player);
    socket.join(room.roomCode);
    io.to(room.roomCode).emit(
      "player-joined",
      ({ roomCode, rounds, currRound, timeLimit, startTime } = room)
    );
    io.to(room.roomCode).emit("player-list-update", room.players);
    io.to(room.roomCode).emit("chat-to-client", {
      senderID: "SYSTEM_MSG",
      chatMsg: `${player.name} has joined the game.`,
      color: "lime",
    });
  });

  socket.on("chat-to-server", (msg) => {
    let room = rooms.find((room) => {
      return room.roomCode === msg.roomCode;
    });
    let player = room.players.find((player) => {
      return player.playerid === socket.id;
    });
    io.to(room.roomCode).emit("chat-to-client", {
      senderID: player.playerid,
      name: player.name,
      avatar: player.avatar,
      chatMsg: msg.chatMsg,
      color: player.color,
    });
  });

  socket.on("player-ready", (msg) => {
    let room = rooms.find((room) => {
      return room.roomCode === msg.roomCode;
    });
    let player = room.players.find((player) => {
      return player.playerid === socket.id;
    });
    if (player.isReady != true) {
      player.isReady = true;
      io.to(room.roomCode).emit("player-list-update", room.players);
      if (checkAllReady(room.players)) {
        room.startTime = 5;
        io.to(room.roomCode).emit("start-round", room);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
