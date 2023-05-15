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
    roundStart: false,
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

const unsetAllReady = (players) => {
  players.forEach((player, ind) => {
    players[ind].isReady = false;
  });
};

const unsetResults = (players, results) => {
  players.forEach((player, ind) => {
    players[ind].hasSubmit = false;
  });
  results.length = 0;
};

const removeInactive = (io, room) => {
  inactivePlayers = [];
  for (player of room.players) {
    if (player.hasSubmit === false) {
      inactivePlayers.push(player.playerid);
    }
  }
  for (id of inactivePlayers) {
    io.sockets.sockets.get(id).disconnect();
  }
};

const computeResults = (results, players) => {
  results.sort((a, b) => {
    return b.confidence - a.confidence;
  });

  results.forEach((result, ind) => {
    results[ind].rank = ind + 1;
    results[ind].points = Math.floor(
      (200 * (results.length - ind)) / results.length +
        50 * results[ind].confidence
    );
    let player = players.find((player) => {
      return player.playerid === results[ind].playerid;
    });
    player.score += results[ind].points;
  });
};

const startRoundTimer = (io, room) => {
  let allReady = false;
  const interval = setInterval(() => {
    if (checkAllReady(room.players) && allReady == false) {
      room.startTime = 6;
      allReady = true;
      room.roundStart = true;
    }

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

      startGameTimer(io, room);
    }
  }, 1000);
};

const startGameTimer = (io, room) => {
  const gameInterval = setInterval(() => {
    if (room.gameTime > 0) room.gameTime--;

    io.to(room.roomCode).emit("game-timer-update", room.gameTime);

    if (room.gameTime == 0) {
      clearInterval(gameInterval);
      io.to(room.roomCode).emit("end-round");
      setTimeout(() => {
        removeInactive(io, room);
        computeResults(room.results, room.players);
        io.to(room.roomCode).emit("show-results", room.results);
        io.to(room.roomCode).emit("player-list-update", room.players);
        setNextRound(io, room);
      }, 2000);
    }
  }, 1000);
};

const setNextRound = (io, room) => {
  if (room.currRound < room.rounds) {
    room.roundStart = false;
    room.currRound++;
    room.startTime = 5 * 60;
    room.gameTime = room.timeLimit;
    unsetAllReady(room.players);
    unsetResults(room.players, room.results);
    startRoundTimer(io, room);
    io.to(room.roomCode).emit(
      "room-update",
      ({ roomCode, rounds, currRound, timeLimit, startTime } = room)
    );
    io.to(room.roomCode).emit("player-list-update", room.players);
  } else {
    io.to(room.roomCode).emit("finish-game");
  }
};

let rooms = [];

io.on("connection", (socket) => {
  socket.on("create-room", (msg) => {
    try {
      let room = createRoom(msg);
      let color = chooseColor(room.chatColors);
      let player = createPlayer(msg, socket, true, color);
      room.players.push(player);
      rooms.push(room);

      socket.join(room.roomCode);

      io.to(room.roomCode).emit("room-created");

      io.to(room.roomCode).emit(
        "room-update",
        ({ roomCode, rounds, currRound, timeLimit, startTime } = room)
      );

      io.to(room.roomCode).emit("player-list-update", room.players);

      io.to(room.roomCode).emit("chat-to-client", {
        senderID: "SYSTEM_MSG",
        chatMsg: `${player.name} has joined the game.`,
        color: "lime",
      });

      startRoundTimer(io, room);
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("join-room", (msg) => {
    try {
      let room = rooms.find((room) => {
        return room.roomCode === msg.roomCode;
      });
      if (room != undefined && room.roundStart === true) {
        io.to(socket.id).emit("round-active", {
          head: "CANNOT JOIN ROOM",
          body: [
            "THE ROUND HAS ALREADY STARTED FOR THE ROOM.",
            "TRY JOINING THE ROOM AFTER SOME TIME.",
          ],
        });
      } else if (room != undefined && room.roundStart === false) {
        let color = chooseColor(room.chatColors);
        let player = createPlayer(msg, socket, false, color);
        if (room.players.length < room.maxPlayers) {
          room.players.push(player);
          socket.join(room.roomCode);

          io.to(room.roomCode).emit("room-found");

          io.to(room.roomCode).emit(
            "room-update",
            ({ roomCode, rounds, currRound, timeLimit, startTime } = room)
          );

          io.to(room.roomCode).emit("player-list-update", room.players);

          io.to(room.roomCode).emit("chat-to-client", {
            senderID: "SYSTEM_MSG",
            chatMsg: `${player.name} has joined the game.`,
            color: "lime",
          });
        } else {
          io.to(socket.id).emit("room-full", {
            head: "ROOM IS FULL",
            body: [
              "THE ROOM IS CURRENTLY AT MAXIMUM CAPACITY AND CANNOT ACCOMMODATE MORE PLAYERS.",
              "TRY JOINING THE ROOM LATER.",
            ],
          });
        }
      } else {
        io.to(socket.id).emit("room-not-found", {
          head: "ROOM NOT FOUND",
          body: [
            "COULD NOT FIND THE ROOM YOU WERE LOOKING FOR.",
            "TRY ENTERING THE CORRECT ROOM-ID.",
          ],
        });
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("chat-to-server", (msg) => {
    try {
      let room = rooms.find((room) => {
        return room.roomCode === msg.roomCode;
      });

      let player;
      if (room != undefined) {
        player = room.players.find((player) => {
          return player.playerid === socket.id;
        });
      }
      if (player != undefined) {
        io.to(room.roomCode).emit("chat-to-client", {
          senderID: player.playerid,
          name: player.name,
          avatar: player.avatar,
          chatMsg: msg.chatMsg,
          color: player.color,
        });
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("player-ready", (msg) => {
    try {
      let room = rooms.find((room) => {
        return room.roomCode === msg.roomCode;
      });

      let player;
      if (room != undefined) {
        player = room.players.find((player) => {
          return player.playerid === socket.id;
        });
      }

      if (player != undefined) {
        if (player.isReady != true) {
          player.isReady = true;

          io.to(room.roomCode).emit("player-list-update", room.players);
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("send-drawing", (msg) => {
    try {
      let room = rooms.find((room) => {
        return room.roomCode === msg.roomCode;
      });

      let player;
      if (room != undefined) {
        player = room.players.find((player) => {
          return player.playerid === socket.id;
        });
      }
      if (player != undefined) {
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
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("leave-room", (roomCode) => {
    try {
      let room = rooms.find((room) => {
        return room.roomCode === roomCode;
      });
      let player;
      if (room != undefined) {
        if (room != undefined) {
          player = room.players.find((player) => {
            return player.playerid === socket.id;
          });
        }
      }
      if (player != undefined) {
        let ind = room.players.findIndex((p) => {
          return p === player;
        });
        room.players.splice(ind, 1);
        io.to(room.roomCode).emit("player-list-update", room.players);
        io.to(room.roomCode).emit("chat-to-client", {
          senderID: "SYSTEM_MSG",
          chatMsg: `${player.name} has left the game.`,
          color: "red",
        });
        if (room.players.length === 0) {
          let r_ind = rooms.findIndex((r) => {
            return r === room;
          });
          rooms.splice(r_ind, 1);
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("disconnect", () => {
    try {
      let room,
        ind = 0,
        found = false;
      for (r of rooms) {
        ind = 0;
        for (player of r.players) {
          if (player.playerid === socket.id) {
            room = r;
            found = true;
            break;
          }
          ind++;
        }
        if (found) break;
      }
      if (found) {
        room.chatColors.push(room.players[ind].color);
        room.players.splice(ind, 1);
        io.to(room.roomCode).emit("player-list-update", room.players);
        io.to(room.roomCode).emit("chat-to-client", {
          senderID: "SYSTEM_MSG",
          chatMsg: `${player.name} has left the game.`,
          color: "red",
        });
        if (room.players.length === 0) {
          let r_ind = rooms.findIndex((r) => {
            return r === room;
          });
          rooms.splice(r_ind, 1);
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
