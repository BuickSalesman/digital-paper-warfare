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

// Declare player IDs.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// Game Rooms Object
let gameRooms = {};

// FPS and deltaTime for Matter.js engine
const FPS = 60;
const deltaTime = 1000 / FPS; // Time per frame in ms

//#endregion GAME AND PLAYER VARIABLES

//#region CANVAS AND CONTEXT VARIABLES

// Fixed game world dimensions
const GAME_WORLD_WIDTH = 10000; // Fixed width in game units
const ASPECT_RATIO = 1 / 1.4142; // A4 aspect ratio
const GAME_WORLD_HEIGHT = GAME_WORLD_WIDTH / ASPECT_RATIO; // Calculate height based on aspect ratio

//#endregion CANVAS AND CONTEXT VARIABLES

//#region SERVER VARIABLES
const PORT = process.env.PORT || 3000;
//#endregion SERVER VARIABLES

//#region MATTER SETUP VARIABLES

// Import Matter components.
const { Body, Bodies, Engine, World } = Matter;

//#endregion MATTER SETUP VARIABLES

//#endregion VARIABLES

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
    console.log(`Received 'joinGame' from socket ${socket.id}`);
    let roomFound = false;

    // Search for a room with less than 2 players
    for (const roomID in gameRooms) {
      const room = gameRooms[roomID];
      console.log(`Checking room ${roomID}: Player1=${room.players.player1}, Player2=${room.players.player2}`);

      if (!room.players.player1 || !room.players.player2) {
        // Assign player to this room
        roomFound = true;
        console.log(`Joining existing room ${roomID}`);
        joinRoom(socket, room);
        break;
      }
    }

    if (!roomFound) {
      // Create a new room
      const newRoomID = `room${Object.keys(gameRooms).length + 1}`;
      console.log(`Creating new room ${newRoomID}`);
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

        if (playerNumber === PLAYER_ONE && room.players.player1 === socket.id) {
          room.players.player1 = null;
          console.log(`Player 1 (${socket.id}) disconnected from ${roomID}`);
        } else if (playerNumber === PLAYER_TWO && room.players.player2 === socket.id) {
          room.players.player2 = null;
          console.log(`Player 2 (${socket.id}) disconnected from ${roomID}`);
        }

        io.to(roomID).emit("playerDisconnected", disconnectedPlayer);
        console.log(`Notified room ${roomID} about disconnection of Player ${disconnectedPlayer}`);

        // If both players are disconnected, remove the room
        if (!room.players.player1 && !room.players.player2) {
          delete gameRooms[roomID];
          console.log(`Room ${roomID} has been removed.`);
        }
      }
    }
  });

  // Handle 'drawing' event
  socket.on("drawing", (data) => {
    console.log(`Received 'drawing' from socket ${socket.id} in room ${socket.roomID}:`, data);
    const roomID = socket.roomID;
    if (roomID) {
      // Broadcast the drawing data to other players in the room
      socket.to(roomID).emit("drawing", {
        playerNumber: socket.playerNumber,
        from: data.from,
        to: data.to,
        color: data.color || "#000000", // Default color
        lineWidth: data.lineWidth || 2, // Default line width
      });
      console.log(`Broadcasted 'drawing' to room ${roomID}`);
    } else {
      console.log(`Socket ${socket.id} is not in a room. Cannot broadcast 'drawing'.`);
    }
  });
});

//#endregion SOCKET EVENTS

//#region FUNCTIONS

//#region GAME ROOM FUNCTIONS

// Function to join an existing room
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
    return; // Exit the function
  }

  socket.join(room.roomID);
  socket.playerNumber = playerNumber;
  socket.roomID = room.roomID;
  socket.emit("playerInfo", { playerNumber, roomID: room.roomID });
  console.log(`Socket ${socket.id} joined ${room.roomID} as Player ${playerNumber}`);

  // If two players are connected, start the game
  if (room.players.player1 && room.players.player2) {
    console.log(`Room ${room.roomID} is now full. Starting game.`);
    // Send the fixed game world dimensions to clients
    io.to(room.roomID).emit("startGame", {
      players: room.players,
      gameWorld: { width: GAME_WORLD_WIDTH, height: GAME_WORLD_HEIGHT },
    });
    // Optionally, send initial game state
    io.to(room.roomID).emit("initialGameState", {
      // Add any initial game state data here
      message: "Game has started.",
    });
    console.log(`Sent 'startGame' and 'initialGameState' to room ${room.roomID}`);
    // Create game bodies if necessary
  }
}

// Function to create a new room
function createNewRoom(roomID, socket) {
  const roomEngine = Matter.Engine.create();
  const roomWorld = roomEngine.world;

  // Set gravity if needed.
  roomEngine.world.gravity.y = 0;
  roomEngine.world.gravity.x = 0;

  const room = {
    roomID: roomID,
    players: {
      player1: socket.id,
      player2: null,
    },
    roomEngine: roomEngine,
    roomWorld: roomWorld,
    width: GAME_WORLD_WIDTH,
    height: GAME_WORLD_HEIGHT,
    bodiesCreated: false,
    allPaths: [], // Store all valid drawing paths
    drawingSessions: {}, // Store ongoing drawing sessions
    shapeCounts: {
      [PLAYER_ONE]: 0,
      [PLAYER_TWO]: 0,
    },
    noDrawZones: [], // Initialize no-draw zones
    totalShapesDrawn: 0,
    currentGameState: GameState.PRE_GAME,
  };

  gameRooms[roomID] = room;
  console.log(`Created room ${roomID}`);

  socket.join(roomID);
  socket.playerNumber = PLAYER_ONE;
  socket.roomID = roomID;
  socket.emit("playerInfo", { playerNumber: PLAYER_ONE, roomID });
  console.log(`Socket ${socket.id} created and joined ${roomID} as Player ${PLAYER_ONE}`);

  // Wait for another player to join
}

//#endregion GAME ROOM FUNCTIONS

//#region MATTER RUNNING AND RENDERING FUNCTIONS

setInterval(() => {
  for (const roomID in gameRooms) {
    const room = gameRooms[roomID];
    Matter.Engine.update(room.roomEngine, deltaTime);
    // Optionally, emit game state updates to clients
    // io.to(roomID).emit("gameUpdate", { /* game state data */ });
  }
}, deltaTime);

//#endregion MATTER RUNNING AND RENDERING FUNCTIONS

//#endregion FUNCTIONS
