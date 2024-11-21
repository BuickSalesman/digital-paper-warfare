const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const Matter = require("matter-js");

const { Body, Bodies, Engine, World, Constraint } = Matter;

// Import game object modules.
const TankModule = require("./objects/tank");
const ReactorModule = require("./objects/reactor");
const FortressModule = require("./objects/fortress");
const TurretModule = require("./objects/turret");
const ShellModule = require("./objects/shell");

// collisionCategories.js exports these constants. These help with collisions.
const {
  CATEGORY_SHELL,
  CATEGORY_TANK,
  CATEGORY_TURRET,
  CATEGORY_FORTRESS,
  CATEGORY_REACTOR,
  CATEGORY_SHAPE,
} = require("./objects/collisionCategories");

// Initialize Express app.
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

// Declare player IDs. These are used to compare virtually all interactions between opposing players. May be useful to refactor into a deconstructed variable, but will require changing all of the code where these variables are called.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// Intialize empty object that holds all the active game rooms currently managed by the server. Each key in this object corresponds to a unique roomID, and the value is the room's state and associated data. Used in every server event throughout the game.
let gameRooms = {};

// Variable to keep track of the next room number in the game rooms object. May want to consider generating a unique ID instead of incrementing to the next sequential ID in the series, to prevent malicious data from incoming client events.
let nextRoomNumber = 1;

// FPS and deltaTime for Matter.js engine
const FPS = 60;
const deltaTime = 1000 / FPS; // Time per frame in ms. Physics engine update interval.

// roomIntervals is an object that keeps track of the interval IDs returned by setInterval for each game room. This allows for management for update loops for each room individually.
let roomIntervals = {};

// Fixed game world dimensions
const GAME_WORLD_WIDTH = 1885; // Fixed width in game units.
const ASPECT_RATIO = 1 / 1.4142; // A4 paper aspect ratio.
const GAME_WORLD_HEIGHT = GAME_WORLD_WIDTH / ASPECT_RATIO; // Calculate height based on aspect ratio

// Sets minimum distance in game units that a player must drag mouse of touch input during an action for it to be considered valid. This helps in preventing tanks from shooting themselves. Ultimately, this should be deleted and shells should have an ID tying them to the tank that shot them, and there should be code present to prevent tanks and shells with congruent IDs from colliding with each other. However, this does prevent minor, accidental movements from occuring, so it is worth looking at keeping.
const minimumDragDistance = 10;

// Sets minimum intial velocity for a created shell, based on power level. This helps in preventing tanks from shooting themselves. Ultimately, this should be deleted and shells should have an ID tying them to the tank that shot them, and there should be code present to prevent tanks and shells with congruent IDs from colliding with each other.
const minimumInitialVelocity = 7.5;

// Constant that sets the proportion of padding to be added around certain areas in the game world where players are not allowed to draw, known as "no-draw zones." By defining this ratio, both the client and server can calculate the exact same padding around no-draw zones, ensuring consistent gameplay and preventing discrepancies.
const NO_DRAW_ZONE_PADDING_RATIO = 0.05;

// Limit in pixels for how long a line a player can draw as a shape before it snaps closed.
const inkLimit = 2000;

// Server ish. Idk man I'm not Bill Gates. Port 3000 if not defined.
const PORT = process.env.PORT || 3000;

// Timer class used for drawing and battle phases. Drawing phase is 60 seconds, battle phase turns should be 30 seconds each.
class Timer {
  constructor(duration, onTick, onEnd, phase) {
    this.duration = duration; // Total duration of the timer in seconds.
    this.timeLeft = duration; // Remaining time left in the countdown.
    this.onTick = onTick; // Function to call every second with the remaining time.
    this.onEnd = onEnd; // Function to call when timer reaches zero.
    this.phase = phase; // 'DRAWING' or 'TURN'
    this.intervalId = null; // ID used to clear setInterval.
  }

  // Starts timer countdown.
  start() {
    this.timeLeft = this.duration;
    this.onTick(this.timeLeft, this.phase);
    this.intervalId = setInterval(() => {
      this.timeLeft--;
      this.onTick(this.timeLeft, this.phase);
      if (this.timeLeft <= 0) {
        this.stop();
        this.onEnd();
      }
    }, 1000);
  }

  // Stops the timer countdown.
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Resets the timer to its initial duration if it stops running.
  reset() {
    this.stop();
    this.timeLeft = this.duration;
    this.onTick(this.timeLeft);
  }
}

// Start the server, listen for incoming connections.
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle 'joinGame' event.
  socket.on("joinGame", (data) => {
    console.log(`Received 'joinGame' from socket ${socket.id}`);

    // Check if data is truthy. If passcode exists in data, assign it to the passcode variable, else null.
    const passcode = data && data.passcode ? data.passcode : null;

    // If passcode exists, validate passcode and start creation/joining of passcode room.
    if (passcode) {
      console.log(`Player wants to join room with passcode: ${passcode}`);

      // Validate passcode (ensure it's 6 digits).
      if (!/^[A-Za-z0-9]{6}$/.test(passcode)) {
        console.log(`Invalid passcode: ${passcode}`);
        socket.emit("invalidPasscode", { message: "Passcode must be exactly 6 letters and numbers." });
        return;
      }

      const roomID = `passcode_${passcode}`; // Use passcode as room ID. Need to find a way to make a unique room ID for passcode rooms after both players join, in order to prevent malicious data incoming from a client outside of that room ID.

      // Retrieve an existing game room from gameRooms.
      let room = gameRooms[roomID];

      // Determine whether to create or join room.
      if (!room) {
        // No room with this passcode exists, create a new one.
        console.log(`Creating new passcode room ${roomID}`);
        createNewRoom(roomID, socket, true);
      } else {
        // Room exists, try to join it.
        console.log(`Joining existing passcode room ${roomID}`);
        joinRoom(socket, room);
      }
    } else {
      //A boolean flag to keep track of whether a suitable room has been found for the player to join. Initially set to false to indicate that no room has been found yet.
      let roomFound = false;

      // Iterate over all roomIDs in the gameRooms object.
      for (const roomID in gameRooms) {
        const room = gameRooms[roomID];
        if (
          // Public room
          !room.isPasscodeRoom &&
          // In LOBBY GameState
          room.currentGameState === GameState.LOBBY &&
          // Has less than 2 players.
          (!room.players.player1 || !room.players.player2)
        ) {
          // Join first available room found, if a room is found.
          roomFound = true;
          console.log(`Joining existing room ${roomID}`);
          joinRoom(socket, room);
          break;
        }
      }
      // If no available room is found, create a new room.
      if (!roomFound) {
        // Create a new room.
        const newRoomID = `room${nextRoomNumber}`;
        nextRoomNumber += 1;
        console.log(`Creating new room ${newRoomID}`);
        createNewRoom(newRoomID, socket);
      }
    }
  });

  // Listen for "ready" event from the client.
  socket.on("ready", () => {
    console.log(`Received 'ready' from socket ${socket.id} in room ${socket.roomID}`);

    // Retrieve the room ID from the socket.
    const roomID = socket.roomID;

    // Proceed only if the room ID exists.
    if (roomID) {
      // Access the game room using the room ID.
      const room = gameRooms[roomID];

      // Proceed only if the room exists.
      if (room) {
        // Increment count of ready players in the room.
        room.readyPlayers += 1;
        console.log(`Room ${roomID} has ${room.readyPlayers} ready player(s).`);

        // Determine the total number of players in the room.
        const totalPlayers = room.players.player1 && room.players.player2 ? 2 : 1;

        // Check if all players in the room are ready.
        if (room.readyPlayers === totalPlayers) {
          // Transition to PRE_GAME.
          room.currentGameState = GameState.PRE_GAME;

          // Emit 'startPreGame' to all clients in the room.
          io.to(roomID).emit("startPreGame", {
            message: "Both players are ready. Starting the game...",
          });

          // Start the drawing timer.
          room.drawingTimer = new Timer(
            60, // Duration in seconds
            (timeLeft, phase) => {
              // OnTick: Send remaining time to clients
              io.to(roomID).emit("updateTimer", { timeLeft, phase });
            },
            () => {
              // OnEnd: Transition to GAME_RUNNING
              console.log(`Drawing phase ended for room ${roomID}`);

              // Coin flip!
              room.currentTurn = Math.random() < 0.5 ? PLAYER_ONE : PLAYER_TWO;

              // Transition to GAME_RUNNING
              room.currentGameState = GameState.GAME_RUNNING;

              createBodiesFromAllShapes(room);

              // Remove no-draw zones
              room.noDrawZones = [];

              // Notify both clients that it is now the battle phase.
              io.to(roomID).emit("gameRunning", {
                message: "Drawing phase has ended. The game is now running.",
                currentTurn: room.currentTurn,
              });

              startTurnTimer(room);
            },
            "DRAWING"
          );

          // Start the drawing timer.
          room.drawingTimer.start();
        }
      }
    }
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;

    if (roomID && localPlayerNumber) {
      const room = gameRooms[roomID];
      if (room) {
        let disconnectedPlayer = localPlayerNumber;

        if (localPlayerNumber === PLAYER_ONE && room.players.player1 === socket.id) {
          room.players.player1 = null;
          console.log(`Player 1 (${socket.id}) disconnected from ${roomID}`);
        } else if (localPlayerNumber === PLAYER_TWO && room.players.player2 === socket.id) {
          room.players.player2 = null;
          console.log(`Player 2 (${socket.id}) disconnected from ${roomID}`);
        }

        // Reset the localPlayerNumber and roomID of the remaining player
        const remainingPlayerSocketId = room.players.player1 || room.players.player2;
        if (remainingPlayerSocketId) {
          const remainingPlayerSocket = io.sockets.sockets.get(remainingPlayerSocketId);
          if (remainingPlayerSocket) {
            remainingPlayerSocket.localPlayerNumber = null;
            remainingPlayerSocket.roomID = null;
            console.log(`Reset localPlayerNumber and roomID for remaining player ${remainingPlayerSocketId}`);
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

        if (room && room.turnTimer) {
          room.turnTimer.stop();
          delete room.turnTimer;
        }

        // Delete the room completely
        delete gameRooms[roomID];
        console.log(`Room ${roomID} has been deleted due to player disconnection.`);
      }
    }
  });

  // Handle 'startDrawing' event
  socket.on("startDrawing", (data) => {
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;
    const drawingSessionId = data.drawingSessionId;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    if (room.playersEndedDrawing && room.playersEndedDrawing[localPlayerNumber]) {
      socket.emit("drawingDisabled", { message: "You have ended your drawing phase." });
      return;
    }

    // Check if the player has reached the maximum number of shapes
    if (room.shapeCounts[localPlayerNumber] >= 5) {
      // Notify the player that they cannot draw more shapes
      socket.emit("drawingDisabled", {
        message: "You have reached the maximum number of shapes.",
      });
      return;
    }

    // Proceed with initializing the drawing session
    if (!room.drawingSessions) {
      room.drawingSessions = {};
    }

    room.drawingSessions[localPlayerNumber] = {
      id: drawingSessionId,
      totalPixelsDrawn: 0,
      path: [],
      isLegal: true,
    };
  });

  socket.on("drawing", (data) => {
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;
    const room = gameRooms[roomID];
    console.log(data);
    console.log(socket.id);
    if (!room) {
      return;
    }

    if (room.shapeCounts[localPlayerNumber] >= 5) {
      return;
    }

    const session = room.drawingSessions[localPlayerNumber];
    if (!session) {
      return;
    }

    // Check if the player has ended their drawing phase
    if (room.playersEndedDrawing && room.playersEndedDrawing[localPlayerNumber]) {
      return;
    }

    if (room.currentGameState !== GameState.PRE_GAME) {
      return;
    }

    const { from, to, color, lineWidth } = data;

    // Validate coordinates
    if (!isValidCoordinate(from) || !isValidCoordinate(to)) {
      console.log(`Invalid coordinates received from player ${localPlayerNumber}`);
      return;
    }

    // Validate that drawing is within player's area
    if (!isWithinPlayerArea(from.y, localPlayerNumber, room) || !isWithinPlayerArea(to.y, localPlayerNumber, room)) {
      console.log(`Player ${localPlayerNumber} attempted to draw outside their area.`);
      session.isLegal = false;
      socket.emit("drawingIllegally", {});
      return;
    }

    // Calculate the distance between the two points
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    session.totalPixelsDrawn += distance;

    // Add the line segment to the path
    session.path.push({ from, to, color, lineWidth });

    // Calculate current opacity based on ink usage
    const maxInk = inkLimit;
    const usedInk = session.totalPixelsDrawn;
    let inkOpacity = 1.0 - usedInk / maxInk;
    inkOpacity = Math.max(0, Math.min(inkOpacity, 1)); // Ensure opacity is within [0, 1]

    if (session.totalPixelsDrawn > inkLimit) {
      // Exceeded the limit, erase the drawing session
      socket.to(roomID).emit("drawingMirror", {
        localPlayerNumber,
        drawingSessionId: session.id,
        from: data.from,
        to: data.to,
        color: "#FF0000", // Red color for illegal drawing
        lineWidth: data.lineWidth,
      });
      socket.emit("drawingIllegally", {});
    } else {
      // Forward the drawing data to other clients, including color and lineWidth

      // Adjust color with calculated opacity (for legal drawings)
      const adjustedColor = session.isLegal ? `rgba(0, 0, 0, ${inkOpacity})` : "#FF0000"; // If illegal, use red

      io.to(roomID).emit("drawingMirror", {
        localPlayerNumber,
        drawingSessionId: session.id,
        from: data.from,
        to: data.to,
        color: adjustedColor,
        lineWidth: data.lineWidth,
      });
    }

    let becameIllegal = false;

    if (session.isLegal) {
      const newLine = [from, to];

      // Check intersection with own shapes
      for (let existingShape of room.allPaths) {
        if (existingShape.localPlayerNumber !== localPlayerNumber) {
          continue;
        }

        const existingSegments = getSegmentsFromPath(existingShape.path);

        for (let segment of existingSegments) {
          if (doLineSegmentsIntersect(newLine[0], newLine[1], segment.from, segment.to)) {
            session.isLegal = false;
            becameIllegal = true;
            console.log(`New line segment intersects with existing shape.`);
            break;
          }
        }
        if (!session.isLegal) {
          break;
        }
      }

      // Check intersection with no-draw zones
      if (session.isLegal) {
        for (let noDrawZone of room.noDrawZones) {
          const noDrawZoneEdges = getEdgesFromCoordinates(noDrawZone.map((point) => [point.x, point.y]));
          for (let edge of noDrawZoneEdges) {
            if (doLineSegmentsIntersect(newLine[0], newLine[1], edge[0], edge[1])) {
              session.isLegal = false;
              becameIllegal = true;
              console.log(`New line segment intersects with no-draw zone.`);
              break;
            }
          }
          if (!session.isLegal) {
            break;
          }
        }
      }

      if (session.isLegal && session.totalPixelsDrawn > inkLimit) {
        session.isLegal = false;
        becameIllegal = true;
      }

      if (becameIllegal) {
        socket.emit("drawingIllegally", {});
      }
    }

    // Send the drawing data to clients with appropriate color
  });

  // Handle 'endDrawing' event
  socket.on("endDrawing", () => {
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    if (room.shapeCounts[localPlayerNumber] >= 5) {
      return;
    }

    const session = room.drawingSessions[localPlayerNumber];
    if (!session) {
      return;
    }

    const path = session.path;
    if (path.length === 0) {
      return;
    }

    const startingPoint = path[0].from;
    const endingPoint = path[path.length - 1].to;

    // Compute closing distance
    const dx = endingPoint.x - startingPoint.x;
    const dy = endingPoint.y - startingPoint.y;

    const maxInk = inkLimit;
    const usedInk = session.totalPixelsDrawn;
    let inkOpacity = 1.0 - usedInk / maxInk;

    if (session.totalPixelsDrawn > inkLimit) {
      // Exceeded pixel limit
      socket.emit("eraseDrawingSession", { drawingSessionId: session.id, localPlayerNumber });
      socket.to(roomID).emit("eraseDrawingSession", { drawingSessionId: session.id, localPlayerNumber });
      delete room.drawingSessions[localPlayerNumber];
      console.log(`Player ${localPlayerNumber}'s drawing exceeded pixel limit after closing and was erased.`);
      return;
    }

    // Close the shape by adding the closing line
    const closingLine = {
      from: endingPoint,
      to: startingPoint,
      color: `rgba(0, 0, 0, ${inkOpacity})`,
      lineWidth: 2,
    };
    session.path.push(closingLine);

    // Convert the new shape to polygon coordinates
    const newShapeCoordinates = buildPolygonCoordinates(session.path);

    let isIllegalShape = false;

    // Existing checks for overlaps or containment with other shapes
    for (let existingShape of room.allPaths) {
      // Skip shapes drawn by the other player
      if (existingShape.localPlayerNumber !== localPlayerNumber) {
        continue;
      }

      const existingShapeCoordinates = buildPolygonCoordinates(existingShape.path);

      if (doPolygonsIntersect(newShapeCoordinates, existingShapeCoordinates)) {
        isIllegalShape = true;
        console.log(`New shape intersects with existing shape drawn by Player ${existingShape.localPlayerNumber}.`);
        break;
      }

      if (isPolygonContained(newShapeCoordinates, existingShapeCoordinates)) {
        isIllegalShape = true;
        console.log(
          `New shape is contained within an existing shape drawn by Player ${existingShape.localPlayerNumber}.`
        );
        break;
      }

      if (isPolygonContained(existingShapeCoordinates, newShapeCoordinates)) {
        isIllegalShape = true;
        console.log(
          `Existing shape drawn by Player ${existingShape.localPlayerNumber} is contained within the new shape.`
        );
        break;
      }
    }

    // New check for intersection with no-draw zones
    if (!isIllegalShape) {
      for (let noDrawZone of room.noDrawZones) {
        const noDrawZoneCoordinates = noDrawZone.map((point) => [point.x, point.y]);
        // Close the no-draw zone polygon if not already closed
        if (
          noDrawZoneCoordinates[0][0] !== noDrawZoneCoordinates[noDrawZoneCoordinates.length - 1][0] ||
          noDrawZoneCoordinates[0][1] !== noDrawZoneCoordinates[noDrawZoneCoordinates.length - 1][1]
        ) {
          noDrawZoneCoordinates.push(noDrawZoneCoordinates[0]);
        }

        if (doPolygonsIntersect(newShapeCoordinates, noDrawZoneCoordinates)) {
          isIllegalShape = true;
          console.log(`New shape intersects with no-draw zone.`);
          break;
        }
      }
    }

    if (isIllegalShape) {
      // Shape is illegal, erase it
      socket.emit("eraseDrawingSession", { drawingSessionId: session.id, localPlayerNumber });
      socket.to(roomID).emit("eraseDrawingSession", { drawingSessionId: session.id, localPlayerNumber });
      delete room.drawingSessions[localPlayerNumber];
      console.log(`Player ${localPlayerNumber}'s drawing was illegal and was erased.`);
    } else {
      // Shape is legal, send 'shapeClosed' event
      io.to(roomID).emit("shapeClosed", {
        localPlayerNumber,
        drawingSessionId: session.id,
        closingLine: closingLine,
      });

      // Add the completed path to allPaths
      room.allPaths.push({
        localPlayerNumber,
        path: session.path,
        drawingSessionId: session.id,
      });

      // createBodiesFromShapes(session.path, room);

      room.shapeCounts[localPlayerNumber] += 1;

      if (room.shapeCounts[localPlayerNumber] >= 5) {
        // Notify the player that they can no longer draw
        const playerSocketId = room.players[`player${localPlayerNumber}`];
        if (playerSocketId) {
          const playerSocket = io.sockets.sockets.get(playerSocketId);
          if (playerSocket) {
            playerSocket.emit("drawingDisabled", {
              message: "You have reached the maximum number of shapes.",
            });
          }
        }
      }

      const shapeLimit = 5;
      if (room.shapeCounts[PLAYER_ONE] >= shapeLimit && room.shapeCounts[PLAYER_TWO] >= shapeLimit) {
        if (room.drawingTimer) {
          room.drawingTimer.stop();
        }

        room.currentTurn = Math.random() < 0.5 ? PLAYER_ONE : PLAYER_TWO;

        // Both players have reached the limit
        room.currentGameState = GameState.GAME_RUNNING;

        createBodiesFromAllShapes(room);

        // Notify both clients
        io.to(roomID).emit("gameRunning", {
          message: "Both players have completed their shapes. The game is now running.",
          currentTurn: room.currentTurn,
        });
      }

      // Remove the drawing session
      delete room.drawingSessions[localPlayerNumber];
      console.log(`Player ${localPlayerNumber}'s drawing was legal and added to allPaths.`);
    }
  });

  socket.on("endDrawingPhase", () => {
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;
    const room = gameRooms[roomID];

    if (!room || room.currentGameState !== GameState.PRE_GAME) {
      return;
    }

    // Set the player's shapeCount to 5
    room.shapeCounts[localPlayerNumber] = 5;

    // Mark that the player has ended their drawing phase
    if (!room.playersEndedDrawing) {
      room.playersEndedDrawing = {};
    }
    room.playersEndedDrawing[localPlayerNumber] = true;

    // Notify the client that drawing is disabled
    socket.emit("drawingDisabled", { message: "You have ended your drawing phase." });

    // Check if both players have either reached the shape limit or ended drawing
    const shapeLimit = 5;
    const playerOneDone =
      room.shapeCounts[PLAYER_ONE] >= shapeLimit || (room.playersEndedDrawing && room.playersEndedDrawing[PLAYER_ONE]);
    const playerTwoDone =
      room.shapeCounts[PLAYER_TWO] >= shapeLimit || (room.playersEndedDrawing && room.playersEndedDrawing[PLAYER_TWO]);

    if (playerOneDone && playerTwoDone) {
      // Both players are done with drawing phase
      if (room.drawingTimer) {
        room.drawingTimer.stop();
      }

      room.currentTurn = Math.random() < 0.5 ? PLAYER_ONE : PLAYER_TWO;

      room.currentGameState = GameState.GAME_RUNNING;

      createBodiesFromAllShapes(room);

      // Remove no-draw zones
      room.noDrawZones = [];

      // Notify both clients
      io.to(roomID).emit("gameRunning", {
        message: "Both players have completed their shapes. The game is now running.",
        currentTurn: room.currentTurn,
      });
    }
  });

  socket.on("eraseLastDrawing", () => {
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;
    const room = gameRooms[roomID];

    if (!room || room.currentGameState !== GameState.PRE_GAME) {
      // Cannot erase drawings after the game has started
      socket.emit("error", { message: "Cannot erase drawings at this stage." });
      return;
    }

    const playerPaths = room.allPaths.filter((path) => path.localPlayerNumber === localPlayerNumber);

    if (playerPaths.length === 0) {
      // No drawings to erase
      socket.emit("error", { message: "No drawings to erase." });
      return;
    }

    // Check if the player has ended their drawing phase
    if (room.playersEndedDrawing && room.playersEndedDrawing[localPlayerNumber]) {
      socket.emit("error", { message: "Cannot erase drawings after ending your drawing phase." });
      return;
    }

    // Get the last drawing the player made
    const lastDrawing = playerPaths[playerPaths.length - 1];

    // Remove it from allPaths
    room.allPaths = room.allPaths.filter((path) => path.drawingSessionId !== lastDrawing.drawingSessionId);

    // Decrement the player's shape count
    room.shapeCounts[localPlayerNumber] -= 1;

    // Notify all clients to erase this drawing
    io.to(roomID).emit("eraseDrawingSession", {
      drawingSessionId: lastDrawing.drawingSessionId,
      localPlayerNumber,
    });

    console.log(`Player ${localPlayerNumber} erased a drawing.`);

    // Re-enable drawing for the player if they are below the shape limit
    if (room.shapeCounts[localPlayerNumber] < 5) {
      const playerSocketId = room.players[`player${localPlayerNumber}`];
      if (playerSocketId) {
        const playerSocket = io.sockets.sockets.get(playerSocketId);
        if (playerSocket) {
          playerSocket.emit("drawingEnabled", {
            message: "You can now draw more shapes.",
          });
        }
      }
    }
  });

  // Handle 'mouseDown' event
  socket.on("mouseDown", (data) => {
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;
    const actionMode = data.actionMode;

    // if (!roomID || !localPlayerNumber) {
    //   return;
    // }

    // if (!room) {
    //   return;
    // }

    // if (room.currentGameState !== GameState.GAME_RUNNING) {
    //   return;
    // }

    const room = gameRooms[roomID];

    if (room.currentTurn !== localPlayerNumber) {
      socket.emit("notYourTurn");
      return;
    }

    if (roomID && localPlayerNumber) {
      const room = gameRooms[roomID];
      if (room) {
        // Prevent multiple mouseDown events without mouseUp
        if (socket.mouseDownData) {
          console.log(`Socket ${socket.id} is already holding mouse down.`);
          return;
        }

        const { x, y } = data;

        if (actionMode === "move") {
          const tank = validateClickOnTank(room, localPlayerNumber, x, y);
          if (tank) {
            socket.mouseDownData = {
              startTime: Date.now(),
              startPosition: { x, y },
              tankId: tank.id,
              actionMode: actionMode,
            };
            socket.emit("validClick");
            console.log(`Player ${localPlayerNumber} started moving tank ${tank.id}`);

            socket.mouseDownTimer = setTimeout(() => {
              console.log(`Auto-triggering mouseUp for socket ${socket.id} after 1.2 seconds`);
              processMouseUp(socket, { x, y }, true); // isForced = true
            }, 450);
          } else {
            socket.emit("invalidClick");
          }
        } else if (actionMode === "shoot") {
          const unit = validateClickOnShootingUnit(room, localPlayerNumber, x, y);
          if (unit) {
            socket.mouseDownData = {
              startTime: Date.now(),
              startPosition: { x, y },
              unitId: unit.id,
              actionMode: actionMode,
            };
            socket.emit("validClick");
            console.log(`Player ${localPlayerNumber} started shooting with unit ${unit.id}`);

            // Start the 1.2-second timer
            socket.mouseDownTimer = setTimeout(() => {
              console.log(`Auto-triggering mouseUp for socket ${socket.id} after 1.2 seconds`);
              processMouseUp(socket, { x, y }, true); // isForced = true
            }, 450);
          } else {
            socket.emit("invalidClick");
          }
        } else {
          socket.emit("invalidActionMode");
        }
      }
    }
  });

  // Handle 'mouseUp' event
  socket.on("mouseUp", (data) => {
    console.log(`Received 'mouseUp' from socket ${socket.id}`);
    processMouseUp(socket, data, false); // isForced = false
  });

  socket.on("mouseMove", (data) => {
    const roomID = socket.roomID;
    const localPlayerNumber = socket.localPlayerNumber;

    if (roomID && localPlayerNumber && socket.mouseDownData) {
      // Update the endPosition with the latest mouse coordinates
      socket.mouseDownData.endPosition = { x: data.x, y: data.y };
    }
  });
});

//#region FUNCTIONS

// This function intializes a new game room with a unique ID. This includes setting up the physics engine, preparing the starting game state, handling collisions, and starting the game loop. Called in the joinGame event handler.
function createNewRoom(roomID, socket, isPasscodeRoom = false) {
  // Set up Matter.js engine and world. Each room has a separate world and engine.
  const roomEngine = Matter.Engine.create();
  const roomWorld = roomEngine.world;

  // Remove gravity to fascilitate top-down gameplay.
  roomEngine.world.gravity.y = 0;
  roomEngine.world.gravity.x = 0;

  // Create room object. This holds all relevant data and state for the room.
  const room = {
    roomID: roomID,
    isPasscodeRoom: isPasscodeRoom,
    players: {
      player1: socket.id, // Creator of the room.
      player2: null, // Await a second player.
    },

    width: GAME_WORLD_WIDTH,
    height: GAME_WORLD_HEIGHT,
    allPaths: [], // Store all valid drawing paths.
    drawingSessions: {}, // Store ongoing drawing sessions.
    shapeCounts: {
      [PLAYER_ONE]: 0,
      [PLAYER_TWO]: 0,
    },
    noDrawZones: [], // Initialize no-draw zones.
    currentGameState: GameState.LOBBY, // Start with LOBBY.
    currentTurn: PLAYER_ONE, // Player 1 starts the game. This is reset on coinflip. Possible refactor to just call the coinflip function here.

    readyPlayers: 0, // The creator is ready by default.
    dividingLine: GAME_WORLD_HEIGHT / 2, // Define dividing line in game world coordinates.

    roomEngine: roomEngine,
    roomWorld: roomWorld,

    shells: [],
  };

  // Listens for Matter collisions. May need additional logic here to prevent shells from colliding with the tanks that they are shot from.
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

  // Cleans up resting shells. Iterates in reverse over all shells in the room. If shell is found to be resting after a check, it is removed from the Matter world and shells array.
  for (let i = room.shells.length - 1; i >= 0; i--) {
    const shell = room.shells[i];
    if (isResting(shell)) {
      Matter.World.remove(room.roomWorld, shell);
      room.shells.splice(i, 1);
    }
  }

  // Come back here later after adding comments to the startRoomInterval function.
  startRoomInterval(roomID);

  // Add the newly created room to the gameRooms object, using roomID as the key.
  gameRooms[roomID] = room;
  console.log(`Created room ${roomID}`);

  // Adds the player's socket to the Socket.IO room identified by roomID.
  socket.join(roomID);
  // Assigns Player 1 to the socket.
  socket.localPlayerNumber = PLAYER_ONE;
  // Stores the roomID on the socket for future reference.
  socket.roomID = roomID;

  // Sends player info to the client. This includes player number, room ID, and width and height of the game world to be used in scaling based on client dimensions.
  socket.emit("playerInfo", {
    localPlayerNumber: PLAYER_ONE,
    roomID,
    gameWorldWidth: GAME_WORLD_WIDTH,
    gameWorldHeight: GAME_WORLD_HEIGHT,
  });
  console.log(`Socket ${socket.id} created and joined ${roomID} as Player ${PLAYER_ONE}`);
}

// Handles assigning player (socket) ro a specified room. Called in the joinGame event handler.
function joinRoom(socket, room) {
  // Stores the player's assigned number.
  let localPlayerNumber;
  // Check if player1 slot is available, if so assign their socket.id to player1.
  if (!room.players.player1) {
    room.players.player1 = socket.id;
    localPlayerNumber = PLAYER_ONE;
    console.log(`Assigned Player 1 to socket ${socket.id} in room ${room.roomID}`);
  } // If player1 already assigned, check if player2 available.
  else if (!room.players.player2) {
    // Assign socket.id to player2.
    room.players.player2 = socket.id;
    localPlayerNumber = PLAYER_TWO;
    console.log(`Assigned Player 2 to socket ${socket.id} in room ${room.roomID}`);
  } else {
    // Room is full.
    console.log(`Room ${room.roomID} is full. Emitting 'gameFull' to socket ${socket.id}`);
    socket.emit("gameFull");
    return;
  }

  // Add player's socket to designated room.
  socket.join(room.roomID);
  // Storess player number on the socket for easy reference.
  socket.localPlayerNumber = localPlayerNumber;
  // Stores the room ID on the socket for easy reference.
  socket.roomID = room.roomID;
  // Sends player info to the client. This includes player number, room ID, and width and height of the game world to be used in scaling based on client dimensions.
  socket.emit("playerInfo", {
    localPlayerNumber,
    roomID: room.roomID,
    gameWorldWidth: GAME_WORLD_WIDTH,
    gameWorldHeight: GAME_WORLD_HEIGHT,
  });
  console.log(`Socket ${socket.id} joined ${room.roomID} as Player ${localPlayerNumber}`);

  // Check if room now has two players.
  if (room.players.player1 && room.players.player2) {
    // Emit 'preGame' to both clients to prepare the game.
    io.to(room.roomID).emit("bothPlayersJoinedRoom", {
      message: "Two players have joined. Prepare to start the game.",
    });

    // Creates the Matter bodies for the room, to be converted into data to be sent to the client for rendering on the game canvas.
    createGameBodies(room);

    // Send initial game state to clients. This is data from the Matter bodies to be used in client rendering.
    io.to(room.roomID).emit("initialGameState", {
      tanks: room.tanks.map(bodyToData),
      reactors: room.reactors.map(bodyToData),
      fortresses: room.fortresses.map(bodyToData),
      turrets: room.turrets.map(bodyToData),
    });
  }
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

        // Emit 'gameUpdate' to all clients in the room
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

// Converts the drawing path to an array of coordinates suitable for polygon-clipping
function buildPolygonCoordinates(path) {
  const coordinates = [];
  // Start with the first 'from' point
  coordinates.push([path[0].from.x, path[0].from.y]);
  // Add 'to' points from each segment
  for (let segment of path) {
    coordinates.push([segment.to.x, segment.to.y]);
  }
  // Ensure the polygon is closed by adding the starting point at the end
  if (
    coordinates.length > 0 &&
    (coordinates[0][0] !== coordinates[coordinates.length - 1][0] ||
      coordinates[0][1] !== coordinates[coordinates.length - 1][1])
  ) {
    coordinates.push(coordinates[0]);
  }
  return coordinates;
}

// Determines the orientation of an ordered triplet (p, q, r)
function orientation(p, q, r) {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < Number.EPSILON) {
    return 0;
  } // colinear
  return val > 0 ? 1 : 2; // clock or counterclockwise
}

function onSegment(p, q, r) {
  return (
    Math.min(p.x, r.x) - Number.EPSILON <= q.x &&
    q.x <= Math.max(p.x, r.x) + Number.EPSILON &&
    Math.min(p.y, r.y) - Number.EPSILON <= q.y &&
    q.y <= Math.max(p.y, r.y) + Number.EPSILON
  );
}

function getEdgesFromCoordinates(polygon) {
  const edges = [];
  for (let i = 0; i < polygon.length - 1; i++) {
    const p1 = { x: polygon[i][0], y: polygon[i][1] };
    const p2 = { x: polygon[i + 1][0], y: polygon[i + 1][1] };
    edges.push([p1, p2]);
  }
  // Close the polygon by connecting the last point to the first
  edges.push([
    { x: polygon[polygon.length - 1][0], y: polygon[polygon.length - 1][1] },
    { x: polygon[0][0], y: polygon[0][1] },
  ]);
  return edges;
}

function doLineSegmentsIntersect(p1, p2, q1, q2) {
  const o1 = orientation(p1, p2, q1);
  const o2 = orientation(p1, p2, q2);
  const o3 = orientation(q1, q2, p1);
  const o4 = orientation(q1, q2, p2);

  // General case
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Special Cases
  if (o1 === 0 && onSegment(p1, q1, p2)) {
    return true;
  }
  if (o2 === 0 && onSegment(p1, q2, p2)) {
    return true;
  }
  if (o3 === 0 && onSegment(q1, p1, q2)) {
    return true;
  }
  if (o4 === 0 && onSegment(q1, p2, q2)) {
    return true;
  }

  return false;
}

// Determines if a point is inside a polygon using the ray-casting algorithm
function isPointInPolygon(point, polygon) {
  let x = point.x,
    y = point.y;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    let xi = polygon[i][0],
      yi = polygon[i][1];
    let xj = polygon[j][0],
      yj = polygon[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

// Checks if two polygons intersect by checking all edges
function doPolygonsIntersect(polygonA, polygonB) {
  const edgesA = getEdgesFromCoordinates(polygonA);
  const edgesB = getEdgesFromCoordinates(polygonB);

  // Check for edge intersections
  for (const [p1, p2] of edgesA) {
    for (const [q1, q2] of edgesB) {
      if (doLineSegmentsIntersect(p1, p2, q1, q2)) {
        return true;
      }
    }
  }

  // Check if a vertex of one polygon is inside the other polygon
  if (isPointInPolygon({ x: polygonA[0][0], y: polygonA[0][1] }, polygonB)) {
    return true;
  }
  if (isPointInPolygon({ x: polygonB[0][0], y: polygonB[0][1] }, polygonA)) {
    return true;
  }

  return false;
}

function isPolygonContained(innerPolygon, outerPolygon) {
  for (let point of innerPolygon) {
    if (!isPointInPolygon({ x: point[0], y: point[1] }, outerPolygon)) {
      return false;
    }
  }
  return true;
}

function getSegmentsFromPath(path) {
  const segments = [];
  for (let segment of path) {
    segments.push({
      from: segment.from,
      to: segment.to,
    });
  }
  return segments;
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

  tanks.forEach((tank) => {
    tank.tracks = []; // Initialize an empty tracks array
  });

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
  fortressNoDrawZone(room);

  room.bodiesCreated = true;
}

function bodyToData(body) {
  const data = {
    id: body.localId,
    label: body.label,
    position: { x: body.position.x, y: body.position.y },
    angle: body.angle,
    size: body.size,
    width: body.width,
    height: body.height,
    playerId: body.playerId,
    hitPoints: body.hitPoints,
  };

  // Include tracks only for tanks
  if (body.label === "Tank" && body.tracks) {
    data.tracks = body.tracks.map((track) => ({
      position: track.position,
      angle: track.angle,
      opacity: track.opacity,
    }));
  }

  return data;
}

// Initialize no-draw zones around fortresses
function fortressNoDrawZone(room) {
  room.noDrawZones = []; // Reset the noDrawZones array

  const padding = room.height * NO_DRAW_ZONE_PADDING_RATIO; // Match client-side padding

  room.fortresses.forEach((fortress) => {
    const zone = createRectangularZone(
      fortress.position.x,
      fortress.position.y,
      fortress.width,
      fortress.height,
      padding
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

function isValidCoordinate(point) {
  return (
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    point.x >= 0 &&
    point.x <= GAME_WORLD_WIDTH &&
    point.y >= 0 &&
    point.y <= GAME_WORLD_HEIGHT
  );
}

function isWithinPlayerArea(y, localPlayerNumber, room) {
  const dividingLine = room.dividingLine;
  if (localPlayerNumber === PLAYER_ONE) {
    return y >= dividingLine;
  } else {
    return y <= dividingLine;
  }
}

function createBodiesFromShape(path, room) {
  const circleRadius = 3; // Adjust the radius as needed

  // Iterate over each segment in the path
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const startPoint = segment.from;
    const endPoint = segment.to;

    // Generate points along the line segment
    const points = getPointsAlongLine(startPoint, endPoint, circleRadius);

    points.forEach((point) => {
      const circle = Matter.Bodies.circle(point.x, point.y, circleRadius, {
        isStatic: true,
        label: "Shape",
        collisionFilter: {
          group: 0,
          category: CATEGORY_SHAPE,
          mask: CATEGORY_SHELL | CATEGORY_TANK,
        },
        friction: 0.005,
        restitution: 0,
      });
      // Add the circle to the room's physics world
      Matter.World.add(room.roomWorld, circle);
    });
  }
}

function createBodiesFromAllShapes(room) {
  room.allPaths.forEach((shape) => {
    createBodiesFromShape(shape.path, room);
  });
}

function getPointsAlongLine(startPoint, endPoint, interval) {
  const points = [];
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.floor(distance / (interval * 2)); // Adjust spacing between circles

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startPoint.x + dx * t;
    const y = startPoint.y + dy * t;
    points.push({ x, y });
  }

  return points;
}

// Helper function to check if a point is inside a Matter.Body
function isPointInBody(body, point) {
  return Matter.Bounds.contains(body.bounds, point) && Matter.Vertices.contains(body.vertices, point);
}

function validateClickOnTank(room, localPlayerNumber, x, y) {
  const playerTanks = room.tanks.filter((tank) => tank.playerId === localPlayerNumber);

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
  const maxDuration = 450; // 0.45 seconds

  const minForce = 0.005; // Adjust as needed
  const maxForce = 5; // Adjust as needed

  // Linear interpolation
  const normalizedDuration = (duration - minDuration) / (maxDuration - minDuration);
  const clampedNormalized = Math.max(0, Math.min(normalizedDuration, 1));
  let force = minForce + clampedNormalized * (maxForce - minForce);

  // Calculate corresponding velocity (assuming mass = 1 for simplicity)
  // Velocity = Force * deltaTime (simplified)
  // Adjust the relation based on your game's physics settings
  const estimatedVelocity = force * 100; // Example multiplier

  if (estimatedVelocity < minimumInitialVelocity) {
    // Adjust force to meet minimum velocity requirement
    force = minimumInitialVelocity / 100; // Reverse the estimation
  }

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
    x: -vector.x * forceMagnitude * 2,
    y: -vector.y * forceMagnitude * 2,
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
  }
}

// Helper function to remove the fixed constraint from a tank.
function releaseTank(tank, roomWorld) {
  if (tank.fixedConstraint) {
    World.remove(roomWorld, tank.fixedConstraint);
    tank.fixedConstraint = null;
  }
}

function validateClickOnShootingUnit(room, localPlayerNumber, x, y) {
  const shootingUnits = [...room.tanks, ...room.turrets].filter((unit) => unit.playerId === localPlayerNumber);
  for (const unit of shootingUnits) {
    if (isPointInBody(unit, { x, y })) {
      return unit;
    }
  }
  return null;
}

function createAndLaunchShell(unit, vector, forceMagnitude, room) {
  const shellSize = 5; // Adjust as needed
  const unitSize = unit.size || Math.max(unit.width, unit.height);
  const shellOffset = unitSize / 2 + shellSize / 2 + 1; // Added 1 unit to ensure separation

  // Invert the vector for opposite direction
  const invertedVector = {
    x: -vector.x,
    y: -vector.y,
  };

  // Position the shell slightly behind the unit relative to launch direction
  const shellPosition = {
    x: unit.position.x + invertedVector.x * shellOffset,
    y: unit.position.y + invertedVector.y * shellOffset,
  };

  // Calculate initial velocity
  let initialVelocity = {
    x: invertedVector.x * forceMagnitude * 10,
    y: invertedVector.y * forceMagnitude * 10,
  };

  // Ensure the initial velocity meets the minimum requirement
  const velocityMagnitude = Math.hypot(initialVelocity.x, initialVelocity.y);
  if (velocityMagnitude < minimumInitialVelocity) {
    // Normalize the vector and apply minimum velocity
    const normalizedVector = {
      x: invertedVector.x / Math.hypot(invertedVector.x, invertedVector.y),
      y: invertedVector.y / Math.hypot(invertedVector.x, invertedVector.y),
    };
    initialVelocity = {
      x: normalizedVector.x * minimumInitialVelocity,
      y: normalizedVector.y * minimumInitialVelocity,
    };
  }

  const playerId = unit.playerId;

  const shell = ShellModule.createShell(
    shellPosition.x,
    shellPosition.y,
    shellSize,
    initialVelocity,
    playerId,
    unitSize // Pass unitSize if needed
  );
  shell.localId = generateUniqueId(); // Ensure each shell has a unique ID
  room.shells.push(shell);
  Matter.World.add(room.roomWorld, shell);
}

function generateUniqueId() {
  return "_" + Math.random().toString(36).substr(2, 9);
}

function bodiesMatch(bodyA, bodyB, label1, label2) {
  return (bodyA.label === label1 && bodyB.label === label2) || (bodyA.label === label2 && bodyB.label === label1);
}

// Helper function to reduce hit points and remove the body if destroyed
function reduceHitPoints(body, engine, removalCallback) {
  body.hitPoints -= 1; // Decrease hitPoints by 1 or adjust based on shell damage
  if (body.hitPoints <= 0) {
    Matter.World.remove(engine.world, body);
    removalCallback();
  } else {
    // Optionally, update body appearance to indicate damage
    // For server-side, you might skip this or handle it via client-side rendering
  }
}

// Handle Tank Destruction
function handleTankDestruction(room, tank, shell) {
  // Emit explosion to clients
  io.to(room.roomID).emit("explosion", {
    x: tank.position.x,
    y: tank.position.y,
  });

  // Remove the shell from the world and room's shell array
  Matter.World.remove(room.roomWorld, shell);
  room.shells = room.shells.filter((s) => s.id !== shell.id);

  // Reduce hitPoints of the tank
  reduceHitPoints(tank, room.roomEngine, () => {
    // Emit tank destruction to clients
    io.to(room.roomID).emit("tankDestroyed", {
      tankId: tank.id,
      playerId: tank.playerId,
    });

    // Remove the tank from the room's tanks array
    room.tanks = room.tanks.filter((t) => t.id !== tank.id);

    // Check if all tanks of the player are destroyed
    checkAllTanksDestroyed(room, tank.playerId);
  }); // Damage value can be adjusted

  // Emit updated hitPoints to clients if the tank is still alive
  if (tank.hitPoints > 0) {
    io.to(room.roomID).emit("updateHitPoints", {
      bodyId: tank.id,
      hitPoints: tank.hitPoints,
    });
  }
}

// Handle Reactor Destruction
function handleReactorDestruction(room, reactor, shell) {
  // Emit explosion to clients
  io.to(room.roomID).emit("explosion", {
    x: reactor.position.x,
    y: reactor.position.y,
  });

  // Remove the shell from the world and room's shell array
  Matter.World.remove(room.roomWorld, shell);
  room.shells = room.shells.filter((s) => s.id !== shell.id);

  // Reduce hitPoints of the reactor
  reduceHitPoints(reactor, room.roomEngine, () => {
    // Emit reactor destruction to clients
    io.to(room.roomID).emit("reactorDestroyed", {
      reactorId: reactor.id,
      playerId: reactor.playerId,
    });

    // Remove the reactor from the room's reactors array
    room.reactors = room.reactors.filter((r) => r.id !== reactor.id);

    // Declare the winner based on reactor destruction
    declareReactorWinner(room, reactor.playerId);
  }); // Damage value can be adjusted

  // Emit updated hitPoints to clients if the reactor is still alive
  if (reactor.hitPoints > 0) {
    io.to(room.roomID).emit("updateHitPoints", {
      bodyId: reactor.id,
      hitPoints: reactor.hitPoints,
    });
  }
}

// Check if all tanks of a player are destroyed
function checkAllTanksDestroyed(room, playerId) {
  const playerTanks = room.tanks.filter((tank) => tank.playerId === playerId);
  const allDestroyed = playerTanks.every((tank) => tank.hitPoints <= 0);

  if (allDestroyed) {
    // Determine the winning player
    const winningPlayerId = playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;

    // Notify clients about the game result
    io.to(room.roomID).emit("gameOver", {
      winner: winningPlayerId,
      reason: "All Tanks Destroyed",
    });

    // Optionally, end the game or reset the room
    endGame(room.roomID);
  }
}

// Declare the winner based on reactor destruction
function declareReactorWinner(room, losingPlayerId) {
  const winningPlayerId = losingPlayerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;

  // Notify clients about the game result
  io.to(room.roomID).emit("gameOver", {
    winner: winningPlayerId,
    reason: "Reactor Destroyed",
  });

  // Optionally, end the game or reset the room
  endGame(room.roomID);
}

// Function to handle game over scenarios
function endGame(roomID) {
  // Clear the physics engine and interval
  const room = gameRooms[roomID];
  if (room) {
    Matter.World.clear(room.roomWorld, false);
    Matter.Engine.clear(room.roomEngine);
    clearInterval(roomIntervals[roomID]);
    delete roomIntervals[roomID];

    if (room.turnTimer) {
      room.turnTimer.stop();
      delete room.turnTimer;
    }

    delete gameRooms[roomID];
    console.log(`Game in room ${roomID} has ended.`);
  }

  // Inform clients to reset their state
  io.to(roomID).emit("resetGame");
}

function processMouseUp(socket, data, isForced = false) {
  const roomID = socket.roomID;
  const localPlayerNumber = socket.localPlayerNumber;

  if (roomID && localPlayerNumber) {
    const room = gameRooms[roomID];
    if (room && socket.mouseDownData) {
      const { startTime, startPosition, tankId, unitId, actionMode, endPosition } = socket.mouseDownData;
      let duration;
      let finalEndPosition;

      if (isForced) {
        duration = 450; // Forced duration of 450 ms
        finalEndPosition = endPosition || startPosition; // Ensure finalEndPosition is defined
      } else {
        duration = Date.now() - startTime;
        finalEndPosition = { x: data.x, y: data.y };
      }

      const deltaX = finalEndPosition.x - startPosition.x;
      const deltaY = finalEndPosition.y - startPosition.y;
      const dragDistance = Math.hypot(deltaX, deltaY);

      if (dragDistance < minimumDragDistance) {
        // Drag distance is too small; ignore the action
        socket.emit("actionTooSmall", { message: "Drag distance too short. Action ignored." });

        // Clean up mouseDownData and timer
        delete socket.mouseDownData;
        if (socket.mouseDownTimer) {
          clearTimeout(socket.mouseDownTimer);
          delete socket.mouseDownTimer;
        }

        console.log(`Ignored action from socket ${socket.id} due to insufficient drag distance.`);
        return;
      }

      const clampedDuration = Math.max(100, Math.min(duration, 450)); // Clamp duration to [100, 450] ms
      const force = calculateForceFromDuration(clampedDuration);
      const vector = calculateVector(startPosition, finalEndPosition);

      if (actionMode === "move") {
        const tank = room.tanks.find((t) => t.id === tankId);
        if (tank) {
          // Emit the tankMoved event
          io.to(room.roomID).emit("tankMoved", {
            tankId: tank.id,
            startingPosition: { x: tank.position.x, y: tank.position.y },
            startingAngle: tank.angle,
          });

          // Manage tank tracks (existing logic)
          if (!tank.tracks) {
            tank.tracks = [];
          }

          tank.tracks = tank.tracks
            .map((track) => ({
              ...track,
              opacity: Math.max(track.opacity - 0.2, 0),
            }))
            .filter((track) => track.opacity > 0);

          tank.tracks.unshift({
            position: { x: tank.position.x, y: tank.position.y },
            angle: tank.angle,
            opacity: 0.6,
          });

          const MAX_TRACKS = 4;
          if (tank.tracks.length > MAX_TRACKS) {
            tank.tracks.pop();
          }

          // Apply force to the tank
          applyForceToTank(tank, vector, force, room.roomWorld);
        }
      } else if (actionMode === "shoot") {
        const unit = room.tanks.find((t) => t.id === unitId) || room.turrets.find((t) => t.id === unitId);
        if (unit) {
          createAndLaunchShell(unit, vector, force, room);
        } else {
          socket.emit("invalidClick");
        }
      }

      // Clean up mouseDownData and timer
      delete socket.mouseDownData;
      if (socket.mouseDownTimer) {
        clearTimeout(socket.mouseDownTimer);
        delete socket.mouseDownTimer;
      }

      // If the mouseUp was forced, inform the client
      if (isForced) {
        socket.emit("powerCapped", { duration: clampedDuration });
      }

      if (room) {
        room.currentTurn = room.currentTurn === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;

        // Notify both players about the turn change
        io.to(room.roomID).emit("turnChanged", { currentTurn: room.currentTurn });

        startTurnTimer(room);
      }
    }
  }
}

function startTurnTimer(room) {
  // Stop any existing turn timer
  if (room.turnTimer) {
    room.turnTimer.stop();
  }

  room.turnTimer = new Timer(
    30, // 30 seconds per turn
    (timeLeft, phase) => {
      // Send remaining time to clients
      io.to(room.roomID).emit("updateTimer", { timeLeft, currentTurn: room.currentTurn, phase });
    },
    () => {
      // OnEnd: Switch turn to other player and restart timer
      console.log(`Turn timer ended for room ${room.roomID}. Switching turns.`);

      room.currentTurn = room.currentTurn === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
      io.to(room.roomID).emit("turnChanged", { currentTurn: room.currentTurn });

      // Start a new timer for the next player's turn
      startTurnTimer(room);
    },
    "TURN"
  );

  // Start the timer
  room.turnTimer.start();
}

//#endregion FUNCTIONS
