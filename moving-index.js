const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const Matter = require("matter-js");

const { Body, Bodies, Engine, World, Constraint } = Matter;

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

const DIVIDING_LINE_MARGIN = 10; // Dividing line margin

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

        // Delete the room completely
        delete gameRooms[roomID];
        console.log(`Room ${roomID} has been deleted due to player disconnection.`);
      }
    }
  });

  socket.on("mouseDown", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const actionMode = data.actionMode;

    if (roomID && playerNumber) {
      const room = gameRooms[roomID];
      if (room) {
        const { x, y } = data;

        if (actionMode === "move") {
          const tank = validateClickOnTank(room, playerNumber, x, y);
          if (tank) {
            socket.mouseDownData = {
              startTime: Date.now(),
              startPosition: { x, y },
              tankId: tank.id,
              actionMode: actionMode,
            };
            socket.emit("validClick");
          } else {
            socket.emit("invalidClick");
          }
        } else if (actionMode === "shoot") {
          const unit = validateClickOnShootingUnit(room, playerNumber, x, y);
          if (unit) {
            socket.mouseDownData = {
              startTime: Date.now(),
              startPosition: { x, y },
              unitId: unit.id,
              actionMode: actionMode,
            };
            socket.emit("validClick");
          } else {
            socket.emit("invalidClick");
          }
        } else {
          socket.emit("invalidActionMode");
        }
      }
    }
  });

  socket.on("mouseUp", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;

    if (roomID && playerNumber) {
      const room = gameRooms[roomID];
      if (room && socket.mouseDownData) {
        const { x, y } = data;
        const { startTime, startPosition, tankId, unitId, actionMode } = socket.mouseDownData;
        const endTime = Date.now();
        const duration = endTime - startTime;
        const clampedDuration = Math.max(100, Math.min(duration, 3000));
        const force = calculateForceFromDuration(clampedDuration);
        const vector = calculateVector(startPosition, { x, y });

        if (actionMode === "move") {
          const tank = room.tanks.find((t) => t.id === tankId);
          if (tank) {
            applyForceToTank(tank, vector, force, room.roomWorld);
            delete socket.mouseDownData;
          }
        } else if (actionMode === "shoot") {
          const unit = getShootingUnitById(room, unitId);
          if (unit) {
            createAndLaunchShell(unit, vector, force, room);
            delete socket.mouseDownData;
          }
        } else {
          socket.emit("invalidActionMode");
        }
      }
    }
  });
});

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

    width: GAME_WORLD_WIDTH,
    height: GAME_WORLD_HEIGHT,

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
      if (bodyA.label === "Shell" || bodyB.label === "Shell") {
        const shell = bodyA.label === "Shell" ? bodyA : bodyB;
        Matter.World.remove(room.roomWorld, shell);
        const index = room.shells.findIndex((s) => s.localId === shell.localId);
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

  // Wait for another player to join
}

// Update the setInterval code
function startRoomInterval(roomID) {
  roomIntervals[roomID] = setInterval(() => {
    const room = gameRooms[roomID];
    if (room) {
      Matter.Engine.update(room.roomEngine, deltaTime);

      // **Ensure room.shells exists before iterating**
      if (room.shells && Array.isArray(room.shells)) {
        // Handle resting shells
        for (let i = room.shells.length - 1; i >= 0; i--) {
          const shell = room.shells[i];
          if (isResting(shell)) {
            Matter.World.remove(room.roomWorld, shell);
            room.shells.splice(i, 1);
          }
        }
      }

      if (room.bodiesCreated) {
        room.tanks.forEach((tank) => {
          if (tank.isActive) {
            // If the tank is active, check if it has come to rest
            if (isResting(tank)) {
              // Tank has come to rest, fix its position and mark as inactive
              fixTankPosition(tank, room.roomWorld);
              tank.isActive = false;
            } else {
              // Tank is still moving, ensure it's not constrained
              releaseTank(tank, room.roomWorld);
            }
          } else {
            // Tank is not active, ensure it's fixed in place
            fixTankPosition(tank, room.roomWorld);
          }
        });

        // Emit the game update to clients
        io.to(roomID).emit("gameUpdate", {
          tanks: room.tanks.map(bodyToData),
          reactors: room.reactors.map(bodyToData),
          fortresses: room.fortresses.map(bodyToData),
          turrets: room.turrets.map(bodyToData),
          shells: room.shells.map(bodyToData),
        });
      }
    } else {
      clearInterval(roomIntervals[roomID]);
      delete roomIntervals[roomID];
    }
  }, deltaTime);
}

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
  const tank1 = TankModule.createTank(width * 0.3525, height * 0.9, tankSize, PLAYER_ONE_ID, 1);
  const tank2 = TankModule.createTank(width * 0.4275, height * 0.9, tankSize, PLAYER_ONE_ID, 2);

  // Create tanks for Player Two
  const tank3 = TankModule.createTank(width * 0.6475, height * 0.1, tankSize, PLAYER_TWO_ID, 3);
  const tank4 = TankModule.createTank(width * 0.5725, height * 0.1, tankSize, PLAYER_TWO_ID, 4);

  const tanks = [tank1, tank2, tank3, tank4];

  // Create reactors for Player One
  const reactor1 = ReactorModule.createReactor(width * 0.3525, height * 0.95, reactorSize, PLAYER_ONE_ID, 1);
  const reactor2 = ReactorModule.createReactor(width * 0.4275, height * 0.95, reactorSize, PLAYER_ONE_ID, 2);

  // Create reactors for Player Two
  const reactor3 = ReactorModule.createReactor(width * 0.6475, height * 0.05, reactorSize, PLAYER_TWO_ID, 3);
  const reactor4 = ReactorModule.createReactor(width * 0.5725, height * 0.05, reactorSize, PLAYER_TWO_ID, 4);

  const reactors = [reactor1, reactor2, reactor3, reactor4];

  // Create fortresses
  const fortress1 = FortressModule.createFortress(
    width * 0.39,
    height * 0.95,
    fortressWidth,
    fortressHeight,
    PLAYER_ONE_ID,
    1
  );
  const fortress2 = FortressModule.createFortress(
    width * 0.61,
    height * 0.05,
    fortressWidth,
    fortressHeight,
    PLAYER_TWO_ID,
    2
  );

  const fortresses = [fortress1, fortress2];

  // Create turrets for Player One
  const turret1 = TurretModule.createTurret(width * 0.31625, height * 0.92125, turretSize, PLAYER_ONE_ID, 1);
  const turret2 = TurretModule.createTurret(width * 0.46375, height * 0.92125, turretSize, PLAYER_ONE_ID, 2);

  // Create turrets for Player Two
  const turret3 = TurretModule.createTurret(width * 0.68375, height * 0.07875, turretSize, PLAYER_TWO_ID, 3);
  const turret4 = TurretModule.createTurret(width * 0.53625, height * 0.07875, turretSize, PLAYER_TWO_ID, 4);

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
  if (!room.shells) {
    room.shells = [];
  }

  // Initialize no-draw zones around fortresses

  room.bodiesCreated = true;
}

function bodyToData(body) {
  return {
    id: body.localId,
    label: body.label,
    position: { x: body.position.x, y: body.position.y },
    angle: body.angle,
    size: body.size || 0, // Use the size property, default to 0 if undefined
    width: body.width || 0, // Use the width property, default to 0 if undefined
    height: body.height || 0, // Use the height property, default to 0 if undefined
    playerId: body.playerId,
  };
}

// Helper function to check if a point is inside a Matter.Body
function isPointInBody(body, point) {
  return Matter.Bounds.contains(body.bounds, point) && Matter.Vertices.contains(body.vertices, point);
}

function validateClickOnTank(room, playerNumber, x, y) {
  const playerTanks = room.tanks.filter((tank) => tank.playerId === playerNumber);

  for (const tank of playerTanks) {
    if (isPointInBody(tank, { x, y })) {
      return tank;
    }
  }
  return null;
}

function calculateForceFromDuration(duration) {
  // Map duration to force
  const minDuration = 100; // 0.1 second
  const maxDuration = 3000; // 3 seconds

  const minForce = 0.005; // Adjust as needed
  const maxForce = 5; // Adjust as needed

  // Linear interpolation
  const normalizedDuration = (duration - minDuration) / (maxDuration - minDuration);
  const clampedNormalized = Math.max(0, Math.min(normalizedDuration, 1));
  const force = minForce + clampedNormalized * (maxForce - minForce);

  return force;
}

function calculateVector(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return { x: deltaX / length, y: deltaY / length };
}

function applyForceToTank(tank, vector, forceMagnitude, roomWorld) {
  tank.isActive = true;

  releaseTank(tank, roomWorld);

  // Apply force in the opposite direction of the vector
  const force = {
    x: -vector.x * forceMagnitude * 10,
    y: -vector.y * forceMagnitude * 10,
  };

  Matter.Body.applyForce(tank, tank.position, force);
}

// Helper function to check if a body is resting (i.e., has negligible velocity).
function isResting(body, threshold = 0.1) {
  const velocityMagnitude = Math.hypot(body.velocity.x, body.velocity.y);
  return velocityMagnitude < threshold;
}

// Helper function to fix the tank's position by adding a constraint.
function fixTankPosition(tank, roomWorld) {
  Body.setVelocity(tank, { x: 0, y: 0 });
  Body.setAngularVelocity(tank, 0);

  if (!tank.fixedConstraint) {
    tank.fixedConstraint = Constraint.create({
      bodyA: tank,
      pointB: { x: tank.position.x, y: tank.position.y },
      stiffness: 1,
      length: 0,
      render: { visible: false },
    });
    World.add(roomWorld, tank.fixedConstraint);
    console.log(`Fixing tank position for tank ID: ${tank.localId}`);
  }
}

// Helper function to remove the fixed constraint from a tank.
function releaseTank(tank, roomWorld) {
  if (tank.fixedConstraint) {
    World.remove(roomWorld, tank.fixedConstraint);
    tank.fixedConstraint = null;
    console.log(`Releasing tank from fixed position for tank ID: ${tank.localId}`);
  }
}

function validateClickOnShootingUnit(room, playerNumber, x, y) {
  const shootingUnits = [...room.tanks, ...room.turrets].filter((unit) => unit.playerId === playerNumber);
  for (const unit of shootingUnits) {
    if (isPointInBody(unit, { x, y })) {
      return unit;
    }
  }
  return null;
}

function getShootingUnitById(room, unitId) {
  return [...room.tanks, ...room.turrets].find((unit) => unit.id === unitId);
}

function createAndLaunchShell(unit, vector, forceMagnitude, room) {
  const shellSize = 10; // Adjust as needed
  const unitSize = unit.size || Math.max(unit.width, unit.height);
  const shellOffset = unitSize / 2 + shellSize / 2;

  // Invert the vector for opposite direction
  const invertedVector = {
    x: -vector.x,
    y: -vector.y,
  };

  // Position the shell **behind** the unit relative to launch direction
  const shellPosition = {
    x: unit.position.x + invertedVector.x * shellOffset,
    y: unit.position.y + invertedVector.y * shellOffset,
  };

  // Launch the shell in the **opposite** direction of the mouse drag
  const initialVelocity = {
    x: invertedVector.x * forceMagnitude * 50,
    y: invertedVector.y * forceMagnitude * 50,
  };

  const playerId = unit.playerId;

  // Pass 'unitSize' as the sixth parameter
  const shell = ShellModule.createShell(
    shellPosition.x,
    shellPosition.y,
    shellSize,
    initialVelocity,
    playerId,
    unitSize // Added tankSize
  );
  shell.localId = generateUniqueId(); // Ensure each shell has a unique ID
  room.shells.push(shell);
  Matter.World.add(room.roomWorld, shell);

  console.log(
    `Shell Created: ID=${shell.localId}, Position=(${shell.position.x}, ${shell.position.y}), Velocity=(${shell.velocity.x}, ${shell.velocity.y}), PlayerID=${playerId}, Size=${shell.size}`
  );
}

function generateUniqueId() {
  return "_" + Math.random().toString(36).substr(2, 9);
}
