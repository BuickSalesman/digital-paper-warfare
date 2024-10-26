// SERVER SIDE:

// VARIABLES

// GAME AND PLAYER VARIABLES

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

// CANVAS AND CONTEXT VARIABLES

// Fixed game world dimensions
const GAME_WORLD_WIDTH = 10000; // Fixed width in game units
const ASPECT_RATIO = 1 / 1.4142; // A4 aspect ratio
const GAME_WORLD_HEIGHT = GAME_WORLD_WIDTH / ASPECT_RATIO; // Calculate height based on aspect ratio

// SERVER VARIABLES
const PORT = process.env.PORT || 3000;

// MATTER SETUP VARIABLES

// Import Matter components.
const { Body, Bodies, Engine, World } = Matter;

// SERVER EVENTS

// Start the server.
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// IO.ON
io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle 'joinGame' event
  socket.on("joinGame", (data) => {
    console.log(`Received 'joinGame' from socket ${socket.id}`);
    const passcode = data && data.passcode ? data.passcode : null;

    if (passcode) {
      console.log(`Player wants to join room with passcode: ${passcode}`);

      // Validate passcode (ensure it's 6 digits)
      if (/^[A-Za-z0-9]{6}$/.test(passcode)) {
        console.log(`Invalid passcode: ${passcode}`);
        socket.emit("invalidPasscode", { message: "Passcode must be exactly 6 digits." });
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

  // Handle 'ready' event
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
          console.log(`Room ${roomID} transitioning to PRE_GAME.`);

          // Emit 'startPreGame' to all clients in the room
          io.to(roomID).emit("startPreGame", {
            message: "Both players are ready. Starting the game...",
          });
          console.log(`Emitted 'startPreGame' to room ${roomID}`);
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

        // Emit 'playerDisconnected' to all clients in the room
        io.to(roomID).emit("playerDisconnected", disconnectedPlayer);
        console.log(`Notified room ${roomID} about disconnection of Player ${disconnectedPlayer}`);

        // Delete the room if appropriate
        if (!room.players.player1 && !room.players.player2) {
          delete gameRooms[roomID];
          console.log(`Room ${roomID} has been deleted as both players disconnected.`);
        } else if (!room.isPasscodeRoom) {
          // For non-passcode rooms, delete the room if any player disconnects
          delete gameRooms[roomID];
          console.log(`Room ${roomID} has been deleted as a player disconnected.`);
        }
      }
    }
  });

  // Handle 'drawing' event
  socket.on("drawing", (data) => {
    console.log(`Received 'drawing' from socket ${socket.id} in room ${socket.roomID}:`, data);
    const roomID = socket.roomID;
    if (roomID) {
      const room = gameRooms[roomID];
      if (room && room.currentGameState === GameState.PRE_GAME) {
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
        console.log(`Room ${roomID} is not in PRE_GAME state. Ignoring 'drawing' event.`);
      }
    } else {
      console.log(`Socket ${socket.id} is not in a room. Cannot broadcast 'drawing'.`);
    }
  });

  // Handle 'snapClose' event
  socket.on("snapClose", (data) => {
    console.log(`Received 'snapClose' from socket ${socket.id} in room ${socket.roomID}:`, data);
    const roomID = socket.roomID;
    if (roomID) {
      const room = gameRooms[roomID];
      if (room && room.currentGameState === GameState.PRE_GAME) {
        // Broadcast the snapClose data to other players in the room
        socket.to(roomID).emit("snapClose", {
          playerNumber: socket.playerNumber,
          from: data.from,
          to: data.to,
          color: data.color || "#000000", // Default color
          lineWidth: data.lineWidth || 2, // Default line width
        });
        console.log(`Broadcasted 'snapClose' to room ${roomID}`);
      } else {
        console.log(`Room ${roomID} is not in PRE_GAME state. Ignoring 'snapClose' event.`);
      }
    } else {
      console.log(`Socket ${socket.id} is not in a room. Cannot broadcast 'snapClose'.`);
    }
  });
});

// FUNCTIONS

// GAME ROOM FUNCTIONS

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
    console.log(`Room ${room.roomID} is now full. Emitting 'preGame' to room.`);
    // Emit 'preGame' to both clients to prepare the game
    io.to(room.roomID).emit("preGame", {
      message: "Two players have joined. Prepare to start the game.",
    });
    console.log(`Emitted 'preGame' to room ${room.roomID}`);
  }
}

// Function to create a new room
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
    currentGameState: GameState.LOBBY, // Start with LOBBY
    readyPlayers: 1, // The creator is ready by default
    dividingLine: GAME_WORLD_HEIGHT / 2, // Define dividing line in game world coordinates
  };

  console.log(`Dividing line for room ${roomID} set at Y = ${room.dividingLine} in game world coordinates`);

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

  // Wait for another player to join
}

// MATTER RUNNING AND RENDERING FUNCTIONS

setInterval(() => {
  for (const roomID in gameRooms) {
    const room = gameRooms[roomID];
    Matter.Engine.update(room.roomEngine, deltaTime);
    // Optionally, emit game state updates to clients
    // io.to(roomID).emit("gameUpdate", { /* game state data */ });
  }
}, deltaTime);
