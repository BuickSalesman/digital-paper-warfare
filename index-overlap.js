const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

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

// CANVAS AND CONTEXT VARIABLES

// Fixed game world dimensions
const GAME_WORLD_WIDTH = 1885; // Fixed width in game units
const ASPECT_RATIO = 1 / 1.4142; // A4 aspect ratio
const GAME_WORLD_HEIGHT = GAME_WORLD_WIDTH / ASPECT_RATIO; // Calculate height based on aspect ratio

const inkLimit = 2000;

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
    const drawingSessionId = data.drawingSessionId; // Get the drawingSessionId from the client
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    // Initialize drawing session for the player
    if (!room.drawingSessions) {
      room.drawingSessions = {};
    }

    room.drawingSessions[playerNumber] = {
      id: drawingSessionId, // Use the drawingSessionId from the client
      totalPixelsDrawn: 0,
      path: [],
    };
  });

  socket.on("drawing", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const room = gameRooms[roomID];
    console.log(data);
    console.log(socket.id);
    if (!room) {
      return;
    }

    const session = room.drawingSessions[playerNumber];
    if (!session) {
      return;
    }

    const { from, to, color, lineWidth } = data;

    // Calculate the distance between the two points
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    session.totalPixelsDrawn += distance;

    // Add the line segment to the path
    session.path.push({ from, to, color, lineWidth });

    if (session.totalPixelsDrawn > inkLimit) {
      // Exceeded the limit, erase the drawing session
      socket.to(roomID).emit("drawingMirror", {
        playerNumber,
        drawingSessionId: session.id,
        from: data.from,
        to: data.to,
        color: "#FF0000", // Red color for illegal drawing
        lineWidth: data.lineWidth,
      });
      socket.emit("drawingIllegally", {});
    } else {
      // Forward the drawing data to other clients, including color and lineWidth
      socket.to(roomID).emit("drawingMirror", {
        playerNumber,
        drawingSessionId: session.id,
        from: data.from,
        to: data.to,
        color: data.color,
        lineWidth: data.lineWidth,
      });
    }
  });

  // Handle 'endDrawing' event
  // In your server-side code
  socket.on("endDrawing", () => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const room = gameRooms[roomID];
    if (!room) return;

    const session = room.drawingSessions[playerNumber];
    if (!session) return;

    const path = session.path;
    if (path.length === 0) return;

    const startingPoint = path[0].from;
    const endingPoint = path[path.length - 1].to;

    // Compute closing distance
    const dx = endingPoint.x - startingPoint.x;
    const dy = endingPoint.y - startingPoint.y;
    const closingDistance = Math.sqrt(dx * dx + dy * dy);
    session.totalPixelsDrawn += closingDistance; // Update total pixels drawn with closing distance

    if (session.totalPixelsDrawn > inkLimit) {
      // Exceeded pixel limit
      socket.emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      socket.to(roomID).emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      delete room.drawingSessions[playerNumber];
      console.log(`Player ${playerNumber}'s drawing exceeded pixel limit after closing and was erased.`);
      return;
    }

    // Close the shape by adding the closing line
    const closingLine = {
      from: endingPoint,
      to: startingPoint,
      color: "#000000",
      lineWidth: 2,
    };
    session.path.push(closingLine);

    // Convert the new shape to polygon coordinates
    const newShapeCoordinates = buildPolygonCoordinates(session.path);

    let isIllegalShape = false;

    // Iterate through existing shapes in the room to check for overlaps or containment
    for (let existingShape of room.allPaths) {
      // Skip shapes drawn by the other player
      if (existingShape.playerNumber !== playerNumber) {
        continue;
      }

      const existingShapeCoordinates = buildPolygonCoordinates(existingShape.path);

      // Check for intersection or containment with the player's own shapes
      if (doPolygonsIntersect(newShapeCoordinates, existingShapeCoordinates)) {
        isIllegalShape = true;
        console.log(`New shape intersects with existing shape drawn by Player ${existingShape.playerNumber}.`);
        break;
      }

      if (isPolygonContained(newShapeCoordinates, existingShapeCoordinates)) {
        isIllegalShape = true;
        console.log(`New shape is contained within an existing shape drawn by Player ${existingShape.playerNumber}.`);
        break;
      }

      if (isPolygonContained(existingShapeCoordinates, newShapeCoordinates)) {
        isIllegalShape = true;
        console.log(`Existing shape drawn by Player ${existingShape.playerNumber} is contained within the new shape.`);
        break;
      }
    }

    if (isIllegalShape) {
      // Shape is illegal, erase it
      socket.emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      socket.to(roomID).emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      delete room.drawingSessions[playerNumber];
      console.log(`Player ${playerNumber}'s drawing was illegal and was erased.`);
    } else {
      // Shape is legal, send 'shapeClosed' event
      io.to(roomID).emit("shapeClosed", {
        playerNumber,
        drawingSessionId: session.id,
        closingLine: closingLine,
      });

      // Add the completed path to allPaths
      room.allPaths.push({
        playerNumber,
        path: session.path,
      });

      // Remove the drawing session
      delete room.drawingSessions[playerNumber];
      console.log(`Player ${playerNumber}'s drawing was legal and added to allPaths.`);
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
    currentGameState: GameState.LOBBY, // Start with LOBBY
    readyPlayers: 0, // The creator is ready by default
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
  if (Math.abs(val) < Number.EPSILON) return 0; // colinear
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
  // Optionally close the polygon by connecting the last point to the first
  // edges.push([{ x: polygon[polygon.length - 1][0], y: polygon[polygon.length - 1][1] }, { x: polygon[0][0], y: polygon[0][1] }]);
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
  if (o1 === 0 && onSegment(p1, q1, p2)) return true;
  if (o2 === 0 && onSegment(p1, q2, p2)) return true;
  if (o3 === 0 && onSegment(q1, p1, q2)) return true;
  if (o4 === 0 && onSegment(q1, p2, q2)) return true;

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
    if (intersect) inside = !inside;
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
