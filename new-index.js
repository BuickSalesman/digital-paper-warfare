const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const Matter = require("matter-js");

const { Body, Bodies, Engine, World } = Matter;

// Import game object modules
const TankModule = require("./objects/tank");
const ReactorModule = require("./objects/reactor");
const FortressModule = require("./objects/fortress");
const TurretModule = require("./objects/turret");
const ShellModule = require("./objects/shell");

// Assuming collisionCategories.js exports these constants
const {
  CATEGORY_SHELL,
  CATEGORY_TANK,
  CATEGORY_TURRET,
  CATEGORY_FORTRESS,
  CATEGORY_REACTOR,
  CATEGORY_SHAPE,
} = require("./objects/collisionCategories");

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Game state setup.
const GameState = Object.freeze({
  LOBBY: "LOBBY",
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
});

// Declare player IDs.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// Game Rooms Object
let gameRooms = {};

// Variable to keep track of the next room number
let nextRoomNumber = 1;

// FPS and deltaTime for Matter.js engine
const FPS = 60;
const deltaTime = 1000 / FPS; // Time per frame in ms
let roomIntervals = {};

// CANVAS AND CONTEXT VARIABLES

// Fixed game world dimensions
const GAME_WORLD_WIDTH = 1885; // Fixed width in game units
const ASPECT_RATIO = 1 / 1.4142; // A4 aspect ratio
const GAME_WORLD_HEIGHT = GAME_WORLD_WIDTH / ASPECT_RATIO; // Calculate height based on aspect ratio

const minimumDragDistance = 10;
const minimumInitialVelocity = 7.5;

const NO_DRAW_ZONE_PADDING_RATIO = 0.05;
const inkLimit = 2000;

const PORT = process.env.PORT || 3000;

// Start the server.
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle 'joinGame' event
  socket.on("joinGame", (data) => {
    console.log(`Received 'joinGame' from socket ${socket.id}`);
    const passcode = data && data.passcode ? data.passcode : null;

    if (passcode) {
      console.log(`Player wants to join room with passcode: ${passcode}`);

      // Validate passcode (ensure it's 6 digits)
      if (!/^[A-Za-z0-9]{6}$/.test(passcode)) {
        console.log(`Invalid passcode: ${passcode}`);
        socket.emit("invalidPasscode", { message: "Passcode must be exactly 6 letters and numbers." });
        return;
      }

      const roomID = `passcode_${passcode}`; // Use passcode as room ID
      let room = gameRooms[roomID];

      if (!room) {
        // No room with this passcode exists, create a new one
        console.log(`Creating new passcode room ${roomID}`);
        createNewRoom(roomID, socket, true);
      } else {
        // Room exists, try to join it
        console.log(`Joining existing passcode room ${roomID}`);
        joinRoom(socket, room);
      }
    } else {
      // Existing logic to join a random available room
      let roomFound = false;

      // Search for a room with less than 2 players and in LOBBY state
      for (const roomID in gameRooms) {
        const room = gameRooms[roomID];
        if (
          !room.isPasscodeRoom &&
          room.currentGameState === GameState.LOBBY &&
          (!room.players.player1 || !room.players.player2)
        ) {
          roomFound = true;
          console.log(`Joining existing room ${roomID}`);
          joinRoom(socket, room);
          break;
        }
      }

      if (!roomFound) {
        // Create a new room
        const newRoomID = `room${nextRoomNumber}`;
        nextRoomNumber += 1;
        console.log(`Creating new room ${newRoomID}`);
        createNewRoom(newRoomID, socket);
      }
    }
  });

  socket.on("ready", () => {
    console.log(`Received 'ready' from socket ${socket.id} in room ${socket.roomID}`);
    const roomID = socket.roomID;
    if (roomID) {
      const room = gameRooms[roomID];
      if (room) {
        room.readyPlayers += 1;
        console.log(`Room ${roomID} has ${room.readyPlayers} ready player(s).`);

        // Check if all players are ready
        const totalPlayers = room.players.player1 && room.players.player2 ? 2 : 1;
        if (room.readyPlayers === totalPlayers) {
          // Transition to PRE_GAME
          room.currentGameState = GameState.PRE_GAME;

          // Emit 'startPreGame' to all clients in the room
          io.to(roomID).emit("startPreGame", {
            message: "Both players are ready. Starting the game...",
          });
        }
      }
    }
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;

    if (roomID && playerNumber) {
      const room = gameRooms[roomID];
      if (room) {
        let disconnectedPlayer = playerNumber;

        if (playerNumber === PLAYER_ONE && room.players.player1 === socket.id) {
          room.players.player1 = null;
          console.log(`Player 1 (${socket.id}) disconnected from ${roomID}`);
        } else if (playerNumber === PLAYER_TWO && room.players.player2 === socket.id) {
          room.players.player2 = null;
          console.log(`Player 2 (${socket.id}) disconnected from ${roomID}`);
        }

        // Reset the playerNumber and roomID of the remaining player
        const remainingPlayerSocketId = room.players.player1 || room.players.player2;
        if (remainingPlayerSocketId) {
          const remainingPlayerSocket = io.sockets.sockets.get(remainingPlayerSocketId);
          if (remainingPlayerSocket) {
            remainingPlayerSocket.playerNumber = null;
            remainingPlayerSocket.roomID = null;
            console.log(`Reset playerNumber and roomID for remaining player ${remainingPlayerSocketId}`);
          }
        }

        // Emit 'playerDisconnected' to all clients in the room
        io.to(roomID).emit("playerDisconnected", disconnectedPlayer);
        console.log(`Notified room ${roomID} about disconnection of Player ${disconnectedPlayer}`);

        // Properly remove all bodies from the Matter.js world
        Matter.World.clear(room.roomWorld, false);
        Matter.Engine.clear(room.roomEngine);

        // Clear the interval
        clearInterval(roomIntervals[roomID]);
        delete roomIntervals[roomID];

        // Clear any active mouseDown timer
        if (socket.mouseDownTimer) {
          clearTimeout(socket.mouseDownTimer);
          delete socket.mouseDownTimer;
          delete socket.mouseDownData;
        }

        // Delete the room completely
        delete gameRooms[roomID];
        console.log(`Room ${roomID} has been deleted due to player disconnection.`);
      }
    }
  });
});

//#region FUNCTIONS

function createNewRoom(roomID, socket, isPasscodeRoom = false) {
  const roomEngine = Matter.Engine.create();
  const roomWorld = roomEngine.world;

  // Set gravity if needed.
  roomEngine.world.gravity.y = 0;
  roomEngine.world.gravity.x = 0;

  const room = {
    roomID: roomID,
    isPasscodeRoom: isPasscodeRoom,
    players: {
      player1: socket.id,
      player2: null,
    },

    width: GAME_WORLD_WIDTH,
    height: GAME_WORLD_HEIGHT,
    allPaths: [], // Store all valid drawing paths
    drawingSessions: {}, // Store ongoing drawing sessions
    shapeCounts: {
      [PLAYER_ONE]: 0,
      [PLAYER_TWO]: 0,
    },
    noDrawZones: [], // Initialize no-draw zones
    currentGameState: GameState.LOBBY, // Start with LOBBY
    readyPlayers: 0, // The creator is ready by default
    dividingLine: GAME_WORLD_HEIGHT / 2, // Define dividing line in game world coordinates

    roomEngine: roomEngine,
    roomWorld: roomWorld,

    shells: [],
  };

  Matter.Events.on(roomEngine, "collisionStart", (event) => {
    const pairs = event.pairs;

    pairs.forEach((pair) => {
      const { bodyA, bodyB } = pair;

      // Check for Tank-Shell collision
      if (bodiesMatch(bodyA, bodyB, "Tank", "Shell")) {
        const tank = bodyA.label === "Tank" ? bodyA : bodyB;
        const shell = bodyA.label === "Shell" ? bodyA : bodyB;

        handleTankDestruction(room, tank, shell);
      }

      // Check for Reactor-Shell collision
      if (bodiesMatch(bodyA, bodyB, "Reactor", "Shell")) {
        const reactor = bodyA.label === "Reactor" ? bodyA : bodyB;
        const shell = bodyA.label === "Shell" ? bodyA : bodyB;

        handleReactorDestruction(room, reactor, shell);
      }

      // Remove the shell if it hits a Shape
      if (bodiesMatch(bodyA, bodyB, "Shell", "Shape")) {
        const shell = bodyA.label === "Shell" ? bodyA : bodyB;
        Matter.World.remove(roomWorld, shell);

        // Also remove from room.shells array
        const index = room.shells.findIndex((s) => s.id === shell.id);
        if (index !== -1) {
          room.shells.splice(index, 1);
        }
      }
    });
  });

  // In your interval function
  for (let i = room.shells.length - 1; i >= 0; i--) {
    const shell = room.shells[i];
    if (isResting(shell)) {
      Matter.World.remove(room.roomWorld, shell);
      room.shells.splice(i, 1);
    }
  }

  startRoomInterval(roomID);

  gameRooms[roomID] = room;
  console.log(`Created room ${roomID}`);

  socket.join(roomID);
  socket.playerNumber = PLAYER_ONE;
  socket.roomID = roomID;
  socket.emit("playerInfo", {
    playerNumber: PLAYER_ONE,
    roomID,
    gameWorldWidth: GAME_WORLD_WIDTH,
    gameWorldHeight: GAME_WORLD_HEIGHT,
  });
  console.log(`Socket ${socket.id} created and joined ${roomID} as Player ${PLAYER_ONE}`);
}

function joinRoom(socket, room) {
  let playerNumber;
  if (!room.players.player1) {
    room.players.player1 = socket.id;
    playerNumber = PLAYER_ONE;
    console.log(`Assigned Player 1 to socket ${socket.id} in room ${room.roomID}`);
  } else if (!room.players.player2) {
    room.players.player2 = socket.id;
    playerNumber = PLAYER_TWO;
    console.log(`Assigned Player 2 to socket ${socket.id} in room ${room.roomID}`);
  } else {
    // Room is full
    console.log(`Room ${room.roomID} is full. Emitting 'gameFull' to socket ${socket.id}`);
    socket.emit("gameFull");
    return;
  }

  socket.join(room.roomID);
  socket.playerNumber = playerNumber;
  socket.roomID = room.roomID;
  socket.emit("playerInfo", {
    playerNumber,
    roomID: room.roomID,
    gameWorldWidth: GAME_WORLD_WIDTH,
    gameWorldHeight: GAME_WORLD_HEIGHT,
  });
  console.log(`Socket ${socket.id} joined ${room.roomID} as Player ${playerNumber}`);

  // Check if room now has two players
  if (room.players.player1 && room.players.player2) {
    // Emit 'preGame' to both clients to prepare the game
    io.to(room.roomID).emit("preGame", {
      message: "Two players have joined. Prepare to start the game.",
    });
    createGameBodies(room);

    // Send initial game state to clients
    io.to(room.roomID).emit("initialGameState", {
      tanks: room.tanks.map(bodyToData),
      reactors: room.reactors.map(bodyToData),
      fortresses: room.fortresses.map(bodyToData),
      turrets: room.turrets.map(bodyToData),
    });
  }
}

//#endregion FUNCTIONS
