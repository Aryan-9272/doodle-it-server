const express = require("express");
const app = express();
const server = require("http").createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
  },
});

const { chatColors, words } = require("./constants");

const PORT = process.env.PORT || 5000;

const createRoom = (msg) => {
  return {
    roomCode: msg.roomCode,
    maxPlayers: msg.maxPlayers,
    rounds: msg.rounds,
    currRound: 1,
    currWord: "",
    timeLimit: msg.timeLimit,
    startTime: 5 * 60,
    gameTime: msg.timeLimit,
    players: [],
    results: [],
    chatColors: [...chatColors],
    words: [...words],
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
    hasSubmit: false,
  };
};

const chooseColor = (chatColors) => {
  const index = Math.floor(Math.random() * chatColors.length);
  const color = chatColors[index];
  chatColors.splice(index, 1);
  return color;
};

const chooseWord = (words) => {
  const index = Math.floor(Math.random() * words.length);
  const word = words[index];
  words.splice(index, 1);
  return word;
};

const checkAllReady = (players) => {
  return players.every((player) => {
    return player.isReady === true;
  });
};

const setAllReady = (players) => {
  players.forEach((player, ind) => {
    players[ind].isReady = true;
  });
};

const checkAllSubmit = (players) => {
  return players.every((player) => {
    return player.hasSubmit === true;
  });
};

const computeResults = (results, players) => {
  results.sort((a, b) => {
    return b.confidence - a.confidence;
  });

  results.forEach((result, ind) => {
    results[ind].rank = ind + 1;
    results[ind].points = (200 * (results.length-ind)) / results.length;
    let player = players.find((player) => {
      return player.playerid === results[ind].playerid;
    });
    player.score += results[ind].points;
  });
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

      if (room.startTime == 0) {
        clearInterval(interval);

        setAllReady(room.players);

        room.currWord = chooseWord(room.words);

        io.to(room.roomCode).emit("start-round", {
          word: room.currWord,
          players: room.players,
        });

        const gameInterval = setInterval(() => {
          if (room.gameTime > 0) room.gameTime--;

          io.to(room.roomCode).emit("game-timer-update", room.gameTime);

          if (room.gameTime == 0) {
            clearInterval(gameInterval);
            io.to(room.roomCode).emit("end-round");

            setTimeout(() => {
              if (checkAllSubmit(room.players)) {
                computeResults(room.results, room.players);
                io.to(room.roomCode).emit("show-results", room.results);
                io.to(room.roomCode).emit("player-list-update", room.players);
              }
            }, 2000);
          }
        }, 1000);
      }
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
        room.startTime = 6;
      }
    }
  });

  socket.on("send-drawing", (msg) => {
    let room = rooms.find((room) => {
      return room.roomCode === msg.roomCode;
    });

    let player = room.players.find((player) => {
      return player.playerid === socket.id;
    });

    if (player.hasSubmit == false) {
      player.hasSubmit = true;
      room.results.push({
        rank: 0,
        playerid: player.playerid,
        name: player.name,
        avatar: player.avatar,
        word: msg.word,
        drawing: msg.img,
        confidence: msg.confidence,
        points: 0,
        closestMatch: msg.closestMatch,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
