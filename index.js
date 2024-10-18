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

// Declare player IDs.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// Game Rooms Object
let gameRooms = {};

// Game constants
const MAX_INK_PER_SHAPE = 1000; // Maximum ink per shape
const DIVIDING_LINE_MARGIN = 10; // Dividing line margin
const DRAWING_MARGIN_X = 20; // Drawing margin X
const DRAWING_MARGIN_Y = 20; // Drawing margin Y
const MAX_TOTAL_SHAPES = 10; // Maximum total shapes
const MAX_SHAPES_PER_PLAYER = 5; // Maximum shapes per player

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

//#region BODY VARIABLES

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

        if (playerNumber === PLAYER_ONE && room.players.player1 === socket.id) {
          room.players.player1 = null;
        } else if (playerNumber === PLAYER_TWO && room.players.player2 === socket.id) {
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

  // Handle Drawing Events
  socket.on("startDrawing", (data) => {
    const { roomID, playerNumber, position } = data;
    const room = gameRooms[roomID];
    if (!room) return;

    // Initialize drawing session for the player
    if (!room.drawingSessions) {
      room.drawingSessions = {};
    }

    room.drawingSessions[playerNumber] = {
      path: [position],
      totalInkUsed: 0,
    };
  });

  socket.on("drawing", (data) => {
    const { roomID, playerNumber, position } = data;
    const room = gameRooms[roomID];
    if (!room || !room.drawingSessions || !room.drawingSessions[playerNumber]) return;

    const session = room.drawingSessions[playerNumber];
    const lastPoint = session.path[session.path.length - 1];

    // Calculate the difference in X and Y between the current and last points.
    const dx = position.x - lastPoint.x;
    const dy = position.y - lastPoint.y;

    // Calculate the segment length.
    const segmentLength = Math.hypot(dx, dy);

    // Check if adding this segment would exceed max ink.
    if (session.totalInkUsed + segmentLength > MAX_INK_PER_SHAPE) {
      // Calculate the remaining ink available for drawing.
      const remainingInk = MAX_INK_PER_SHAPE - session.totalInkUsed;

      // Determine the ratio of segment length to remaining ink.
      const ratio = remainingInk / segmentLength;

      if (ratio > 0) {
        // Calculate the X and Y coordinates where the ink limit is reached using the remaining ink ratio.
        const limitedX = lastPoint.x + dx * ratio;
        const limitedY = lastPoint.y + dy * ratio;

        const limitedPoint = { x: limitedX, y: limitedY };

        // Add the constrained point to the drawing path.
        session.path.push(limitedPoint);
        session.totalInkUsed = MAX_INK_PER_SHAPE;

        // Emit the limited drawing point to all clients in the room.
        io.to(roomID).emit("drawingData", {
          path: [lastPoint, limitedPoint],
          playerNumber,
        });

        // End the drawing session for the player.
        endDrawingSession(room, playerNumber);
      }
    } else {
      // Increment total ink used by the length of the new segment.
      session.totalInkUsed += segmentLength;

      // Add the current mouse position to the drawing path.
      session.path.push(position);

      // Emit the drawing point to all clients in the room.
      io.to(roomID).emit("drawingData", {
        path: [lastPoint, position],
        playerNumber,
      });
    }
  });

  socket.on("endDrawing", (data) => {
    const { roomID, playerNumber, path } = data;
    const room = gameRooms[roomID];
    if (!room || !room.drawingSessions || !room.drawingSessions[playerNumber]) return;

    const session = room.drawingSessions[playerNumber];
    session.path = path;

    // Close the shape by connecting the last point to the first point if necessary.
    const firstPoint = session.path[0];
    const lastPoint = session.path[session.path.length - 1];
    const distance = Math.hypot(lastPoint.x - firstPoint.x, lastPoint.y - firstPoint.y);
    const snapThreshold = 10; // Adjust as needed

    if (distance > snapThreshold) {
      session.path.push({ x: firstPoint.x, y: firstPoint.y });
    } else {
      session.path[session.path.length - 1] = { x: firstPoint.x, y: firstPoint.y };
    }

    // Validate the shape
    if (validateDrawing(room, session.path, playerNumber)) {
      // Check shape counters
      if (room.shapeCounts[playerNumber] >= MAX_SHAPES_PER_PLAYER || room.totalShapesDrawn >= MAX_TOTAL_SHAPES) {
        // Exceeded shape limits
        socket.emit("invalidShape", { message: "Shape limit reached." });
        // Optionally, remove the last path
        return;
      }

      // Add the valid path to allPaths
      if (!room.allPaths) {
        room.allPaths = [];
      }
      room.allPaths.push({ path: session.path, playerNumber });

      // Broadcast the valid shape to all clients
      io.to(roomID).emit("drawingData", {
        path: session.path,
        playerNumber,
      });

      // Increment shape counts and handle game state transitions
      handleShapeCount(room, playerNumber);
    } else {
      // Invalid shape, notify the player (optional)
      socket.emit("invalidShape", { message: "Invalid drawing. Please try again." });
    }

    // Remove the drawing session
    delete room.drawingSessions[playerNumber];
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
    playerNumber = PLAYER_ONE;
  } else if (!room.players.player2) {
    room.players.player2 = socket.id;
    playerNumber = PLAYER_TWO;
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

//#endregion BODY CREATION FUNCTIONS

//#region DRAWING VALIDATION FUNCTIONS

// Function to validate the drawing path
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
  // Helper function to project a polygon onto an axis and return the min and max projections
  function project(polygon, axis) {
    let min = dotProduct(polygon[0], axis);
    let max = min;
    for (let i = 1; i < polygon.length; i++) {
      const p = dotProduct(polygon[i], axis);
      if (p < min) {
        min = p;
      }
      if (p > max) {
        max = p;
      }
    }
    return { min, max };
  }

  // Helper function to calculate the dot product of two vectors
  function dotProduct(point, axis) {
    return point.x * axis.x + point.y * axis.y;
  }

  // Helper function to get the edges of a polygon
  function getEdges(polygon) {
    const edges = [];
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      edges.push({ x: p2.x - p1.x, y: p2.y - p1.y });
    }
    return edges;
  }

  // Helper function to get the perpendicular (normal) of an edge
  function getNormal(edge) {
    return { x: -edge.y, y: edge.x };
  }

  // Get all edges from both polygons
  const edgesA = getEdges(polygonA);
  const edgesB = getEdges(polygonB);
  const allEdges = [...edgesA, ...edgesB];

  // For each edge, compute the axis perpendicular to the edge
  for (const edge of allEdges) {
    const axis = getNormal(edge);

    // Project both polygons onto the axis
    const projectionA = project(polygonA, axis);
    const projectionB = project(polygonB, axis);

    // Check for overlap between projections
    if (projectionA.max < projectionB.min || projectionB.max < projectionA.min) {
      // No overlap on this axis, so polygons do not intersect
      return false;
    }
  }

  // Overlap on all axes, so polygons intersect
  return true;
}

//#endregion DRAWING VALIDATION FUNCTIONS

//#region DRAWING HANDLING FUNCTIONS

// Function to handle the end of a drawing session
function endDrawingSession(room, playerNumber) {
  // You can implement additional logic here if needed
  // For example, automatically finalize the drawing phase after certain conditions
}

// Function to handle shape counts and game state transitions
function handleShapeCount(room, playerNumber) {
  // Implement shape count tracking per player
  room.shapeCounts[playerNumber] += 1;
  room.totalShapesDrawn += 1;

  const maxShapeCountPlayer1 = MAX_SHAPES_PER_PLAYER;
  const maxShapeCountPlayer2 = MAX_SHAPES_PER_PLAYER;

  if (playerNumber === PLAYER_ONE && room.shapeCounts[playerNumber] >= maxShapeCountPlayer1) {
    // Player 1 has finished drawing
    console.log(`Player ${PLAYER_ONE} has finished drawing.`);
  } else if (playerNumber === PLAYER_TWO && room.shapeCounts[playerNumber] >= maxShapeCountPlayer2) {
    // Player 2 has finished drawing
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

//#endregion DRAWING HANDLING FUNCTIONS

//#region GAME ROOM FUNCTIONS

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

//#endregion GAME ROOM FUNCTIONS

//#endregion FUNCTIONS
