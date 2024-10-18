//#region VARIABLES

//#region GAME AND PLAYER VARIABLES

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const Matter = require("matter-js");

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Game state setup.
const GameState = Object.freeze({
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
});

let currentGameState = GameState.PRE_GAME;

// Declare player ID's.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// Game Rooms Object
let gameRooms = {};

const FPS = 60;
const deltaTime = 1000 / FPS; // Time per frame in ms

//#endregion GAME AND PLAYER VARIABLES

//#region CANVAS AND CONTEXT VARIABLES

// Define acceptable dimension ranges
const MIN_WIDTH = 300;
const MAX_WIDTH = 1920;
const MIN_HEIGHT = 300;
const MAX_HEIGHT = 1080;

//#endregion CANVAS AND CONTEXT VARIABLES

//#region SERVER VARIABLES
const PORT = process.env.PORT || 3000;
//#endregion SERVER VARIABLES

//#region MATTER SETUP VARIABLES

// Import Matter components.
const {
  Body,
  Bodies,
  Bounds,
  Collision,
  Constraint,
  Detector,
  Engine,
  Events,
  Mouse,
  MouseConstraint,
  Render,
  Runner,
  Vertices,
  Vector,
  World,
} = Matter;

// Declare engine.
const engine = Engine.create();

// Declare world.
const world = engine.world;

//#endregion MATTER SETUP VARIABLES

//#endregion VARIABLES

//#region WORLD SETUP

//Disable gravity.
engine.world.gravity.y = 0;
engine.world.gravity.x = 0;

//#region BODY CREATION

//#endregion BODY CREATIONS

//#endregion WORLD SETUP

//#region SOCKET EVENTS

//#region SERVER EVENTS

// Start the server.
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

//#endregion SERVER EVENTS

//#region IO.ON
io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle 'joinGame' event
  socket.on("joinGame", () => {
    let roomFound = false;

    // Search for a room with less than 2 players
    for (const roomID in gameRooms) {
      const room = gameRooms[roomID];

      if (!room.players.player1 || !room.players.player2) {
        // Assign player to this room
        roomFound = true;
        joinRoom(socket, room);
        break;
      }
    }

    if (!roomFound) {
      // Create a new room
      const newRoomID = `room${Object.keys(gameRooms).length + 1}`;
      createNewRoom(newRoomID, socket);
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

        if (playerNumber === 1 && room.players.player1 === socket.id) {
          room.players.player1 = null;
          World.remove(room.world, room.balls.player1);
          room.balls.player1 = null;
        } else if (playerNumber === 2 && room.players.player2 === socket.id) {
          room.players.player2 = null;
          World.remove(room.world, room.balls.player2);
          room.balls.player2 = null;
        }

        io.to(roomID).emit("playerDisconnected", disconnectedPlayer);
        console.log(`Player ${disconnectedPlayer} has disconnected from ${roomID}.`);

        // If both players are disconnected, remove the room
        if (!room.players.player1 && !room.players.player2) {
          delete gameRooms[roomID];
          console.log(`Room ${roomID} has been removed.`);
        }
      }
    }
  });
});

//#endregion IO.ON
//#endregion SOCKET EVENTS

//#region FUNCTIONS

//#region GAME ROOM FUNCTIONS
// Function to join an existing room
function joinRoom(socket, room) {
  let playerNumber;
  if (!room.players.player1) {
    room.players.player1 = socket.id;
    playerNumber = 1;
  } else if (!room.players.player2) {
    room.players.player2 = socket.id;
    playerNumber = 2;
  } else {
    // Room is full
    socket.emit("gameFull");
    return; // Exit the function
  }

  socket.join(room.roomID);
  socket.playerNumber = playerNumber;
  socket.roomID = room.roomID;
  socket.emit("playerInfo", { playerNumber, roomID: room.roomID });
  console.log(`Socket ${socket.id} joined ${room.roomID} as Player ${playerNumber}`);

  // If two players are connected, start the game
  if (room.players.player1 && room.players.player2) {
    io.to(room.roomID).emit("startGame", { players: room.players });
  }
}

// Function to create a new room
function createNewRoom(roomID, socket) {
  const engine = engine;
  const world = engine.world;

  const room = {
    roomID: roomID,
    players: {
      player1: socket.id,
      player2: null,
    },

    engine: engine,
    world: world,
  };

  gameRooms[roomID] = room;

  socket.join(roomID);
  socket.playerNumber = 1;
  socket.roomID = roomID;
  socket.emit("playerInfo", { playerNumber: 1, roomID });
  console.log(`Socket ${socket.id} created and joined ${roomID} as Player 1`);

  // Wait for another player to join
}
//#endregion GAME ROOM FUNCTIONS

//#region GAME BOARD FUNCTIONS
function validateDimension(value, min, max) {
  if (typeof value !== "number" || value < min || value > max) {
    // Set to default if invalid
    return (min + max) / 2;
  }
  return value;
}
//#endregion GAME BOARD FUNCTIONS

//#region MATTER RUNNING AND RENDERING FUNCTIONS
setInterval(() => {
  for (const roomID in gameRooms) {
    const room = gameRooms[roomID];
    Engine.update(room.engine, deltaTime);
  }
}, deltaTime);
//#endregion MATTER RUNNING AND RENDING FUNCTIONS

//#region MATTER BODY FUNTIONS

//#region BODY CREATION FUNCTIONS

function createWalls(width, height) {
  return [
    // Top wall
    Bodies.rectangle(width / 2, -500, width + 1000, 1000, { isStatic: true }),
    // Bottom wall
    Bodies.rectangle(width / 2, height + 500, width + 1000, 1000, { isStatic: true }),
    // Left wall
    Bodies.rectangle(-500, height / 2, 1000, height + 1000, { isStatic: true }),
    // Right wall
    Bodies.rectangle(width + 500, height / 2, 1000, height + 1000, { isStatic: true }),
  ];
}
//#endregion BODY CREATION FUNCTIONS

//#endregion MATTER BODY FUNCTIONS

//#endregion FUNCTIONS
