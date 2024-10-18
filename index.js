// server.js

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

// Declare player IDs.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// Game Rooms Object
let gameRooms = {};

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

//#region BODY VARIABLES

const TankModule = require("./objects/tank");
const ReactorModule = require("./objects/reactor");
const FortressModule = require("./objects/fortress");
const TurretModule = require("./objects/turret");
const ShellModule = require("./objects/shell");

const {
  CATEGORY_SHELL,
  CATEGORY_TANK,
  CATEGORY_TURRET,
  CATEGORY_FORTRESS,
  CATEGORY_REACTOR,
  CATEGORY_SHAPE,
} = require("./objects/collisionCategories");

//#endregion BODY VARIABLES

//#endregion VARIABLES

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
        } else if (playerNumber === 2 && room.players.player2 === socket.id) {
          room.players.player2 = null;
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
    // Send the fixed game world dimensions to clients
    io.to(room.roomID).emit("startGame", {
      players: room.players,
      gameWorld: { width: GAME_WORLD_WIDTH, height: GAME_WORLD_HEIGHT },
    });
    // Create game bodies
    createGameBodies(room);

    // **Send initial game state to clients**
    io.to(room.roomID).emit("initialGameState", {
      tanks: room.tanks.map(bodyToData),
      reactors: room.reactors.map(bodyToData),
      fortresses: room.fortresses.map(bodyToData),
      turrets: room.turrets.map(bodyToData),
    });
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

//#region MATTER RUNNING AND RENDERING FUNCTIONS

setInterval(() => {
  for (const roomID in gameRooms) {
    const room = gameRooms[roomID];
    Matter.Engine.update(room.roomEngine, deltaTime);

    // Only proceed if the game bodies have been created
    if (room.bodiesCreated) {
      // Send updated positions to clients
      io.to(roomID).emit("gameUpdate", {
        tanks: room.tanks.map(bodyToData),
        reactors: room.reactors.map(bodyToData),
        fortresses: room.fortresses.map(bodyToData),
        turrets: room.turrets.map(bodyToData),
        shells: room.shells.map(bodyToData), // Include shells if applicable
      });
    }
  }
}, deltaTime);

//#endregion MATTER RUNNING AND RENDERING FUNCTIONS

//#region MATTER BODY FUNCTIONS

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

function createGameBodies(room) {
  const { width, height } = room;
  const roomWorld = room.roomWorld;

  // Create walls
  const walls = createWalls(width, height);
  Matter.World.add(roomWorld, walls);

  // Calculate sizes based on width and height
  const tankSize = width * 0.02;
  const reactorSize = tankSize;
  const fortressWidth = width * 0.1475;
  const fortressHeight = height * 0.0575;
  const turretSize = reactorSize * 1.125;

  // Define player IDs
  const PLAYER_ONE = 1;
  const PLAYER_TWO = 2;

  // Create tanks for Player One
  const tank1 = TankModule.createTank(width * 0.3525, height * 0.9, tankSize, PLAYER_ONE);
  const tank2 = TankModule.createTank(width * 0.4275, height * 0.9, tankSize, PLAYER_ONE);

  // Create tanks for Player Two
  const tank3 = TankModule.createTank(width * 0.6475, height * 0.1, tankSize, PLAYER_TWO);
  const tank4 = TankModule.createTank(width * 0.5725, height * 0.1, tankSize, PLAYER_TWO);

  const tanks = [tank1, tank2, tank3, tank4];

  // Create reactors for Player One
  const reactor1 = ReactorModule.createReactor(width * 0.3525, height * 0.95, reactorSize, PLAYER_ONE);
  const reactor2 = ReactorModule.createReactor(width * 0.4275, height * 0.95, reactorSize, PLAYER_ONE);

  // Create reactors for Player Two
  const reactor3 = ReactorModule.createReactor(width * 0.6475, height * 0.05, reactorSize, PLAYER_TWO);
  const reactor4 = ReactorModule.createReactor(width * 0.5725, height * 0.05, reactorSize, PLAYER_TWO);

  const reactors = [reactor1, reactor2, reactor3, reactor4];

  // Create fortresses
  const fortress1 = FortressModule.createFortress(
    width * 0.39,
    height * 0.95,
    fortressWidth,
    fortressHeight,
    PLAYER_ONE
  );
  const fortress2 = FortressModule.createFortress(
    width * 0.61,
    height * 0.05,
    fortressWidth,
    fortressHeight,
    PLAYER_TWO
  );

  const fortresses = [fortress1, fortress2];

  // Create turrets for Player One
  const turret1 = TurretModule.createTurret(width * 0.31625, height * 0.92125, turretSize, PLAYER_ONE);
  const turret2 = TurretModule.createTurret(width * 0.46375, height * 0.92125, turretSize, PLAYER_ONE);

  // Create turrets for Player Two
  const turret3 = TurretModule.createTurret(width * 0.68375, height * 0.07875, turretSize, PLAYER_TWO);
  const turret4 = TurretModule.createTurret(width * 0.53625, height * 0.07875, turretSize, PLAYER_TWO);

  const turrets = [turret1, turret2, turret3, turret4];

  // Add bodies to the world
  Matter.World.add(roomWorld, [...tanks, ...reactors, ...fortresses, ...turrets]);

  // Store bodies in the room object
  room.tanks = tanks;
  room.reactors = reactors;
  room.fortresses = fortresses;
  room.turrets = turrets;

  // Store sizes if needed later
  room.tankSize = tankSize;
  room.reactorSize = reactorSize;
  room.fortressWidth = fortressWidth;
  room.fortressHeight = fortressHeight;
  room.turretSize = turretSize;

  // Initialize an array for shells
  room.shells = [];

  room.bodiesCreated = true;
}

function bodyToData(body) {
  return {
    id: body.id,
    label: body.label,
    position: { x: body.position.x, y: body.position.y },
    angle: body.angle,
    size: body.size || 0, // Use the size property, default to 0 if undefined
    width: body.width || 0, // Use the width property, default to 0 if undefined
    height: body.height || 0, // Use the height property, default to 0 if undefined
    playerId: body.playerId,
  };
}

//#endregion BODY CREATION FUNCTIONS

//#endregion MATTER BODY FUNCTIONS

//#endregion FUNCTIONS
