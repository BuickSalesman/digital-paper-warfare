// SERVER SIDE:

// VARIABLES

// GAME AND PLAYER VARIABLES

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const Matter = require("matter-js");

// Import Matter components.
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

// Game constants
const MAX_INK_PER_SHAPE = 10000; // Maximum ink per shape
const DIVIDING_LINE_MARGIN = 10; // Dividing line margin
const DRAWING_MARGIN_X = 20; // Drawing margin X
const DRAWING_MARGIN_Y = 20; // Drawing margin Y
const MAX_TOTAL_SHAPES = 10; // Maximum total shapes
const MAX_SHAPES_PER_PLAYER = 5; // Maximum shapes per player

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

  // Handle 'startDrawing' event
  socket.on("startDrawing", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const position = data.position;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    // Initialize drawing session for the player
    if (!room.drawingSessions) {
      room.drawingSessions = {};
    }

    room.drawingSessions[playerNumber] = {
      path: [position],
      totalInkUsed: 0,
    };
  });

  // Handle 'drawing' event
  // Handle 'drawing' event by forwarding it to other clients
  socket.on("drawing", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    // Emit the drawing data to other clients in the room
    socket.to(roomID).emit("drawing", {
      playerNumber,
      from: data.from,
      to: data.to,
      color: data.color,
      lineWidth: data.lineWidth,
    });
  });

  // Handle 'endDrawing' event
  socket.on("endDrawing", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const room = gameRooms[roomID];
    if (!room || !room.drawingSessions || !room.drawingSessions[playerNumber]) {
      return;
    }

    const session = room.drawingSessions[playerNumber];

    // Close the shape by connecting the last point to the first point if necessary.
    const firstPoint = session.path[0];
    const lastPoint = session.path[session.path.length - 1];
    const distance = Math.hypot(lastPoint.x - firstPoint.x, lastPoint.y - firstPoint.y);
    const snapThreshold = 10; // 10 game units

    if (distance > snapThreshold) {
      session.path.push({ x: firstPoint.x, y: firstPoint.y });
    } else {
      session.path[session.path.length - 1] = { x: firstPoint.x, y: firstPoint.y };
    }

    // Validate the drawing
    const isValid = validateDrawing(room, session.path, playerNumber);

    if (!isValid) {
      // Invalid shape, notify the player
      socket.emit("invalidShape", { message: "Shapes cannot overlap, or be in no draw zones. Try drawing again." });
      console.log(`Player ${playerNumber} attempted to draw an invalid shape in room ${roomID}.`);

      // Remove the drawing session
      delete room.drawingSessions[playerNumber];
      return;
    }

    // Shape is valid, add it to allPaths
    room.allPaths.push({ path: [...session.path], playerNumber });

    // Increment shape counts and handle game state transitions
    handleShapeCount(room, playerNumber);

    // Broadcast the valid shape to all clients
    io.to(roomID).emit("drawing", {
      path: session.path,
      playerNumber,
    });

    console.log(`Player ${playerNumber} successfully drew a shape in room ${roomID}.`);

    // Remove the drawing session
    delete room.drawingSessions[playerNumber];
  });

  // Handle 'snapClose' event by forwarding it to other clients
  socket.on("snapClose", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    // Emit the snapClose data to other clients in the room
    socket.to(roomID).emit("snapClose", {
      playerNumber,
      from: data.from,
      to: data.to,
      color: data.color,
      lineWidth: data.lineWidth,
    });
  });

  // Handle 'finalizeDrawingPhase' event
  socket.on("finalizeDrawingPhase", () => {
    const roomID = socket.roomID;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    finalizeDrawingPhase(room);
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

    // Create game bodies
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

// Function to create a new room
function createNewRoom(roomID, socket, isPasscodeRoom = false) {
  const roomEngine = Matter.Engine.create();
  const roomWorld = roomEngine.world;

  // Set gravity if needed.
  roomEngine.world.gravity.y = 10;
  roomEngine.world.gravity.x = 10;

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

// MATTER BODY FUNCTIONS

// BODY CREATION FUNCTIONS

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
  const PLAYER_ONE_ID = PLAYER_ONE;
  const PLAYER_TWO_ID = PLAYER_TWO;

  // Create tanks for Player One
  const tank1 = TankModule.createTank(width * 0.3525, height * 0.9, tankSize, PLAYER_ONE_ID);
  const tank2 = TankModule.createTank(width * 0.4275, height * 0.9, tankSize, PLAYER_ONE_ID);

  // Create tanks for Player Two
  const tank3 = TankModule.createTank(width * 0.6475, height * 0.1, tankSize, PLAYER_TWO_ID);
  const tank4 = TankModule.createTank(width * 0.5725, height * 0.1, tankSize, PLAYER_TWO_ID);

  const tanks = [tank1, tank2, tank3, tank4];

  // Create reactors for Player One
  const reactor1 = ReactorModule.createReactor(width * 0.3525, height * 0.95, reactorSize, PLAYER_ONE_ID);
  const reactor2 = ReactorModule.createReactor(width * 0.4275, height * 0.95, reactorSize, PLAYER_ONE_ID);

  // Create reactors for Player Two
  const reactor3 = ReactorModule.createReactor(width * 0.6475, height * 0.05, reactorSize, PLAYER_TWO_ID);
  const reactor4 = ReactorModule.createReactor(width * 0.5725, height * 0.05, reactorSize, PLAYER_TWO_ID);

  const reactors = [reactor1, reactor2, reactor3, reactor4];

  // Create fortresses
  const fortress1 = FortressModule.createFortress(
    width * 0.39,
    height * 0.95,
    fortressWidth,
    fortressHeight,
    PLAYER_ONE_ID
  );
  const fortress2 = FortressModule.createFortress(
    width * 0.61,
    height * 0.05,
    fortressWidth,
    fortressHeight,
    PLAYER_TWO_ID
  );

  const fortresses = [fortress1, fortress2];

  // Create turrets for Player One
  const turret1 = TurretModule.createTurret(width * 0.31625, height * 0.92125, turretSize, PLAYER_ONE_ID);
  const turret2 = TurretModule.createTurret(width * 0.46375, height * 0.92125, turretSize, PLAYER_ONE_ID);

  // Create turrets for Player Two
  const turret3 = TurretModule.createTurret(width * 0.68375, height * 0.07875, turretSize, PLAYER_TWO_ID);
  const turret4 = TurretModule.createTurret(width * 0.53625, height * 0.07875, turretSize, PLAYER_TWO_ID);

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

  // Initialize no-draw zones around fortresses
  fortressNoDrawZone(room);

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

// DRAWING VALIDATION FUNCTIONS

function validateDrawing(room, path, playerNumber) {
  // Enforce drawing area per player.
  // Player 1 draws below the dividing line.
  // Player 2 draws above the dividing line.
  const dividingLine = room.height / 2;

  for (const point of path) {
    if (playerNumber === PLAYER_ONE) {
      if (point.y < dividingLine + DIVIDING_LINE_MARGIN) {
        return false;
      }
    } else if (playerNumber === PLAYER_TWO) {
      if (point.y > dividingLine - DIVIDING_LINE_MARGIN) {
        return false;
      }
    }
  }

  // Clamp mouse position within drawable area horizontally.
  for (const point of path) {
    if (point.x < DRAWING_MARGIN_X || point.x > room.width - DRAWING_MARGIN_X) {
      return false;
    }
    if (point.y < DRAWING_MARGIN_Y || point.y > room.height - DRAWING_MARGIN_Y) {
      return false;
    }
  }

  // Check for overlaps with existing shapes in allPaths.
  for (const existingPath of room.allPaths) {
    if (polygonsOverlap(path, existingPath.path)) {
      return false;
    }
  }

  // Check overlap with no-draw zones.
  for (const zone of room.noDrawZones) {
    if (polygonsOverlap(path, zone)) {
      return false;
    }
  }

  // If all checks pass, the drawing is valid.
  return true;
}

// Implements polygon overlap detection using the Separating Axis Theorem (SAT).
function polygonsOverlap(polygonA, polygonB) {
  // Helper functions...
  // (Include the same helper functions as in the second file)
}

// DRAWING HANDLING FUNCTIONS

// Function to handle the end of a drawing session
function endDrawingSession(room, playerNumber) {
  // Implement additional logic if needed
}

// Function to handle shape counts and game state transitions
function handleShapeCount(room, playerNumber) {
  room.shapeCounts[playerNumber] += 1;
  room.totalShapesDrawn += 1;

  const maxShapeCountPlayer1 = MAX_SHAPES_PER_PLAYER;
  const maxShapeCountPlayer2 = MAX_SHAPES_PER_PLAYER;

  if (playerNumber === PLAYER_ONE && room.shapeCounts[playerNumber] >= maxShapeCountPlayer1) {
    console.log(`Player ${PLAYER_ONE} has finished drawing.`);
  } else if (playerNumber === PLAYER_TWO && room.shapeCounts[playerNumber] >= maxShapeCountPlayer2) {
    console.log(`Player ${PLAYER_TWO} has finished drawing.`);
  }

  // Check if both players have finished drawing
  if (room.shapeCounts[PLAYER_ONE] >= maxShapeCountPlayer1 && room.shapeCounts[PLAYER_TWO] >= maxShapeCountPlayer2) {
    finalizeDrawingPhase(room);
  }
}

// Function to finalize the drawing phase
function finalizeDrawingPhase(room) {
  room.currentGameState = GameState.GAME_RUNNING;
  io.to(room.roomID).emit("finalizeDrawingPhase");
  console.log(`Drawing phase finalized for room ${room.roomID}. Game is now running.`);
  // Implement additional game start logic here
}

// GAME ROOM FUNCTIONS

// Initialize no-draw zones around fortresses
function fortressNoDrawZone(room) {
  room.noDrawZones = []; // Reset the noDrawZones array

  room.fortresses.forEach((fortress) => {
    const zone = createRectangularZone(
      fortress.position.x,
      fortress.position.y,
      fortress.width,
      fortress.height,
      DIVIDING_LINE_MARGIN // Padding as per dividing line margin
    );
    // Add the no-draw zone to the array
    room.noDrawZones.push(zone);
  });
}

// Creates a rectangular no-draw zone with padding.
function createRectangularZone(centerX, centerY, width, height, padding) {
  const halfWidth = width / 2 + padding;
  const halfHeight = height / 2 + padding;

  return [
    { x: centerX - halfWidth, y: centerY - halfHeight }, // Top-Left
    { x: centerX + halfWidth, y: centerY - halfHeight }, // Top-Right
    { x: centerX + halfWidth, y: centerY + halfHeight }, // Bottom-Right
    { x: centerX - halfWidth, y: centerY + halfHeight }, // Bottom-Left
  ];
}
