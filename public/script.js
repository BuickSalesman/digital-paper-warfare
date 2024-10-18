//#region VARIABLES

//#region GAME AND PLAYER VARIABLES

// Player and Room Info
let playerNumber = null;
let roomID = null;
let renderingStarted = false; // Flag to prevent multiple render loops

// Game world dimensions received from the server
let gameWorldWidth = null;
let gameWorldHeight = null;

// Scaling factors
let scaleX = 1;
let scaleY = 1;

// Flag to indicate if the canvas should be rotated
let shouldRotateCanvas = false;

// No-Draw Zones
let noDrawZones = [];

// Drawing Variables
const GameState = {
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
};
let currentGameState = GameState.PRE_GAME;
let isDrawing = false;
let isDrawingBelow = true;
let drawingPath = [];
let allPaths = []; // All drawing paths from all players
const maxInkPerShape = 1000; // For user feedback; server enforces actual limit
let totalInkUsed = 0;
const dividingLineMargin = 10; // For UI purposes; server enforces actual margin
const drawingMarginX = 20;
const drawingMarginY = 20;

// Shape Counters (for UI feedback)
let shapeCountPlayer1 = 0;
let shapeCountPlayer2 = 0;
const maxTotalShapes = 10;
const maxShapesPerPlayer = 5;

// Canvas dimensions (will be set dynamically)
let width = 1000; // Placeholder, will be updated
let height = 1414; // Placeholder, will be updated

// Define Player Constants
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

//#endregion GAME AND PLAYER VARIABLES

//#region HTML ELEMENT VARIABLES

// Declare landing page.
const landingPage = document.getElementById("landing-page");

// Declare join button.
const joinButton = document.getElementById("join-button");

// Declare status text.
const statusText = document.getElementById("status");

// Declare gameAndPowerContainer element.
const gameAndPowerContainer = document.getElementById("gameAndPowerContainer");

// Declare gameContainer element.
const gameContainer = document.getElementById("gameContainer");

// Declare the canvas.
const drawCanvas = document.getElementById("drawCanvas"); // For drawing.

// Declare the power meter.
const powerMeterFill = document.getElementById("powerMeterFill");

// Declare the move button.
const moveButton = document.getElementById("moveButton");

// Declare the shoot button.
const shootButton = document.getElementById("shootButton");

// Declare the rules button.
const rulesButton = document.getElementById("rulzButton");

// Declare the close button within the rules modal.
const closeButton = document.querySelector(".close-button");

// Declare the rules modal.
const rulesModal = document.getElementById("rulesModal");

// Declare the end drawing button.
const endDrawButton = document.getElementById("endDrawButton");

// Declare the timer display.
const timerElement = document.getElementById("Timer");

//#endregion HTML ELEMENT VARIABLES

//#region CANVAS AND CONTEXT VARIABLES

// Declare contexts for drawing canvas.
const drawCtx = drawCanvas.getContext("2d");

// Declare a dividing line halfway between the top and bottom of the canvas.
let dividingLine;

//#endregion CANVAS AND CONTEXT VARIABLES

//#region BODY VARIABLES

// Variables to store game objects
let tanks = [];
let reactors = [];
let fortresses = [];
let turrets = [];
let shells = []; // If shells are sent from the server

//#endregion BODY VARIABLES

//#region SOCKET VARIABLES
const socket = io();
//#endregion SOCKET VARIABLES

//#endregion VARIABLES

//#region EVENT HANDLERS

// Wait for the window to fully load
window.addEventListener("load", () => {
  // Initialize canvas dimensions
  initializeCanvas();

  // Add mouse event listeners for drawing
  addDrawingEventListeners();
});

// Function to initialize canvas dimensions
function initializeCanvas() {
  // Declare height, width, and aspect ratio for the canvas.
  const aspectRatio = 1 / 1.4142; // A4 aspect ratio (taller than wide)
  const baseWidth = Math.min(window.innerWidth * 0.95, 10000); // Use 95% of window width or max 10000px
  let canvasWidth = baseWidth;
  let canvasHeight = canvasWidth / aspectRatio; // Calculate height based on aspect ratio

  // Ensure height doesn't exceed window height
  if (canvasHeight > window.innerHeight * 0.95) {
    canvasHeight = window.innerHeight * 0.95;
    canvasWidth = canvasHeight * aspectRatio;
  }

  // Set up gameContainer dimensions.
  gameContainer.style.width = `${canvasWidth}px`;
  gameContainer.style.height = `${canvasHeight}px`;

  // Set canvas size.
  drawCanvas.width = canvasWidth;
  drawCanvas.height = canvasHeight;

  // Update local width and height variables
  width = canvasWidth;
  height = canvasHeight;

  dividingLine = drawCanvas.height / 2;

  // Optionally, log the dimensions to verify
  console.log("Initial Canvas Width:", drawCanvas.width);
  console.log("Initial Canvas Height:", drawCanvas.height);

  // Update scaling factors if game world dimensions are known
  if (gameWorldWidth && gameWorldHeight) {
    updateScalingFactors();
  }

  // Redraw no-draw zones if they exist
  if (noDrawZones.length > 0) {
    drawNoDrawZones();
  }
}

// If you want the canvas to resize when the window is resized while maintaining aspect ratio
window.addEventListener("resize", resizeCanvas);

//#endregion EVENT HANDLERS

//#region SOCKET EVENTS

//#region SOCKET.ON

// Receive Player Info
socket.on("playerInfo", (data) => {
  playerNumber = data.playerNumber;
  roomID = data.roomID;
  statusText.textContent = `You are Player ${playerNumber}`;

  // Determine if the canvas should be rotated
  if (playerNumber === PLAYER_TWO) {
    shouldRotateCanvas = true;
  }

  // Initialize currentPlayerDrawing based on playerNumber
  console.log(`Player ${playerNumber} joined room ${roomID}`);
});

// Handle Game Start
socket.on("startGame", (data) => {
  if (playerNumber === PLAYER_ONE || playerNumber === PLAYER_TWO) {
    // Receive game world dimensions from server
    gameWorldWidth = data.gameWorld.width;
    gameWorldHeight = data.gameWorld.height;

    // Update scaling factors
    updateScalingFactors();

    startGame();
  }
});

// Handle initial game state
socket.on("initialGameState", (data) => {
  console.log("Received initial game state:", data); // Debugging statement
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;

  // Create no-draw zones around fortresses
  fortressNoDrawZone();

  // Start rendering if not already started
  if (!renderingStarted) {
    renderingStarted = true;
    requestAnimationFrame(render);
  }
});

// Handle game updates
socket.on("gameUpdate", (data) => {
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;
  shells = data.shells || []; // If shells are sent

  // Update no-draw zones in case fortresses have moved
  fortressNoDrawZone();
});

// Handle Player Disconnection
socket.on("playerDisconnected", (number) => {
  statusText.textContent = `Player ${number} disconnected. Waiting for a new player...`;
  joinButton.disabled = false;
  // Optionally, stop the game loop or reset the game state
});

// Receive Drawing Data from Server
socket.on("drawingData", (data) => {
  const { path, playerNumber: drawingPlayerNumber } = data;

  // Add the received path to allPaths
  allPaths.push({ path, playerNumber: drawingPlayerNumber });

  // Redraw the canvas to include the new drawing
  redrawCanvas();
});

// Receive Finalize Drawing Phase
socket.on("finalizeDrawingPhase", () => {
  currentGameState = GameState.GAME_RUNNING;
  // Additional logic to transition to game running can be added here
  console.log("Drawing phase finalized. Game is now running.");
});

// Receive Invalid Shape Notification
socket.on("invalidShape", (data) => {
  alert(data.message);
});

//#endregion SOCKET.ON

//#endregion SOCKET EVENTS

//#region EVENT HANDLERS

//#region BUTTON EVENT HANDLERS

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  socket.emit("joinGame");
  statusText.textContent = "Waiting for another player...";
  joinButton.disabled = true;
});

// Open rules modal when rules button is clicked.
rulesButton.addEventListener("click", openModal);

// Close modal when close button is clicked.
closeButton.addEventListener("click", closeModal);

// Close modal if user clicks outside the modal content
window.addEventListener("click", function (event) {
  if (event.target === rulesModal) {
    closeModal();
  }
});

// Handle End Drawing Button Click
endDrawButton.addEventListener("click", () => {
  if (isDrawing) {
    endDrawing();
  }
});

//#endregion BUTTON EVENT HANDLERS

//#region DRAWING EVENT HANDLERS

// Function to add mouse event listeners for drawing
function addDrawingEventListeners() {
  drawCanvas.addEventListener("mousedown", (event) => {
    if (currentGameState !== GameState.PRE_GAME) {
      return;
    }
    startDrawing(event);
  });

  drawCanvas.addEventListener("mousemove", (event) => {
    if (currentGameState !== GameState.PRE_GAME) {
      return;
    }
    if (!isDrawing) {
      return;
    }
    draw(event);
  });

  drawCanvas.addEventListener("mouseup", () => {
    if (currentGameState !== GameState.PRE_GAME) {
      return;
    }
    if (!isDrawing) {
      return;
    }
    endDrawing();
  });

  drawCanvas.addEventListener("mouseleave", () => {
    if (currentGameState !== GameState.PRE_GAME) {
      return;
    }
    if (!isDrawing) {
      return;
    }
    endDrawing();
  });
}

//#endregion DRAWING EVENT HANDLERS

//#endregion EVENT HANDLERS

//#region FUNCTIONS

//#region GAME STATE FUNCTIONS

// Function to Start the Game
function startGame() {
  // Hide Landing Page and Show Game Canvas
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";
  currentGameState = GameState.PRE_GAME;
}

//#endregion GAME STATE FUNCTIONS

//#region SCALING FUNCTIONS

function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
}

//#endregion SCALING FUNCTIONS

//#region RENDERING FUNCTIONS

// Function to Render the Game State
function render() {
  // Clear the canvas
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  drawCtx.save();

  // Apply 180-degree rotation around the center if player is Player 2
  if (shouldRotateCanvas) {
    drawCtx.translate(drawCanvas.width / 2, drawCanvas.height / 2);
    drawCtx.rotate(Math.PI);
    drawCtx.translate(-drawCanvas.width / 2, -drawCanvas.height / 2);
  }

  // Now draw everything using the original positions
  drawDividingLine();
  fortresses.forEach(drawFortress);
  reactors.forEach(drawReactor);
  turrets.forEach(drawTurret);
  tanks.forEach(drawTank);
  // Draw shells if applicable
  // shells.forEach(drawShell);

  // Draw no-draw zones
  drawNoDrawZones();

  // Draw allPaths
  allPaths.forEach((drawing) => {
    drawServerDrawing(drawing.path, drawing.playerNumber);
  });

  // Draw the current user's drawingPath
  if (isDrawing && drawingPath.length > 1) {
    drawCtx.beginPath();
    drawCtx.moveTo(drawingPath[0].x * scaleX, drawingPath[0].y * scaleY);
    for (let i = 1; i < drawingPath.length; i++) {
      drawCtx.lineTo(drawingPath[i].x * scaleX, drawingPath[i].y * scaleY);
    }

    // Change color based on ink usage
    const inkUsageRatio = totalInkUsed / maxInkPerShape;
    if (inkUsageRatio > 0.66) {
      drawCtx.strokeStyle = "red";
    } else if (inkUsageRatio > 0.33) {
      drawCtx.strokeStyle = "orange";
    } else {
      drawCtx.strokeStyle = "blue";
    }

    drawCtx.lineWidth = 2;
    drawCtx.stroke();
  }

  drawCtx.restore();

  // Continue the loop
  requestAnimationFrame(render);
}

// Function to Draw a Drawing Path from Server
function drawServerDrawing(path, drawingPlayerNumber) {
  if (path.length < 2) {
    return;
  }

  drawCtx.beginPath();
  drawCtx.moveTo(path[0].x * scaleX, path[0].y * scaleY);
  for (let i = 1; i < path.length; i++) {
    drawCtx.lineTo(path[i].x * scaleX, path[i].y * scaleY);
  }

  // Change color based on player number
  if (drawingPlayerNumber === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (drawingPlayerNumber === PLAYER_TWO) {
    drawCtx.strokeStyle = "red";
  } else {
    drawCtx.strokeStyle = "black";
  }

  drawCtx.lineWidth = 2;
  drawCtx.stroke();
}

// Function to Redraw the Canvas
function redrawCanvas() {
  // Clear the canvas
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  drawCtx.save();

  // Apply 180-degree rotation around the center if player is Player 2
  if (shouldRotateCanvas) {
    drawCtx.translate(drawCanvas.width / 2, drawCanvas.height / 2);
    drawCtx.rotate(Math.PI);
    drawCtx.translate(-drawCanvas.width / 2, -drawCanvas.height / 2);
  }

  // Draw static elements
  drawDividingLine();
  fortresses.forEach(drawFortress);
  reactors.forEach(drawReactor);
  turrets.forEach(drawTurret);
  tanks.forEach(drawTank);
  // shells.forEach(drawShell);

  // Draw no-draw zones
  drawNoDrawZones();

  // Draw allPaths
  allPaths.forEach((drawing) => {
    drawServerDrawing(drawing.path, drawing.playerNumber);
  });

  // Draw the current user's drawingPath
  if (isDrawing && drawingPath.length > 1) {
    drawCtx.beginPath();
    drawCtx.moveTo(drawingPath[0].x * scaleX, drawingPath[0].y * scaleY);
    for (let i = 1; i < drawingPath.length; i++) {
      drawCtx.lineTo(drawingPath[i].x * scaleX, drawingPath[i].y * scaleY);
    }

    // Change color based on ink usage
    const inkUsageRatio = totalInkUsed / maxInkPerShape;
    if (inkUsageRatio > 0.66) {
      drawCtx.strokeStyle = "red";
    } else if (inkUsageRatio > 0.33) {
      drawCtx.strokeStyle = "orange";
    } else {
      drawCtx.strokeStyle = "blue";
    }

    drawCtx.lineWidth = 2;
    drawCtx.stroke();
  }

  drawCtx.restore();
}

// Function to Resize Canvas while maintaining aspect ratio
function resizeCanvas() {
  // Re-initialize canvas dimensions
  initializeCanvas();

  // Update scaling factors
  if (gameWorldWidth && gameWorldHeight) {
    updateScalingFactors();
  }
}

//#endregion RENDERING FUNCTIONS

//#region MODAL HELPER FUNCTIONS

// Function to open the rules modal.
function openModal() {
  rulesModal.style.display = "block";
}

// Function to close the rules modal.
function closeModal() {
  rulesModal.style.display = "none";
}

//#endregion MODAL HELPER FUNCTIONS

//#region DRAWING FUNCTIONS

// Draws the dividing line on the canvas.
function drawDividingLine() {
  drawCtx.beginPath();
  drawCtx.moveTo(0, dividingLine);
  drawCtx.lineTo(drawCanvas.width, dividingLine);
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.stroke();
}

function drawTank(tank) {
  const size = tank.size;
  const x = tank.position.x * scaleX;
  const y = tank.position.y * scaleY;
  const scaledSize = size * scaleX; // Assuming uniform scaling

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(tank.angle); // Use the angle directly

  // Set color based on playerId
  if (tank.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (tank.playerId === PLAYER_TWO) {
    drawCtx.strokeStyle = "red";
  } else {
    drawCtx.strokeStyle = "black";
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-scaledSize / 2, -scaledSize / 2, scaledSize, scaledSize);
  drawCtx.restore();
}

function drawReactor(reactor) {
  const radius = (reactor.size / 2) * scaleX; // Assuming uniform scaling
  const x = reactor.position.x * scaleX;
  const y = reactor.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);

  // Set color based on playerId
  if (reactor.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (reactor.playerId === PLAYER_TWO) {
    drawCtx.strokeStyle = "red";
  } else {
    drawCtx.strokeStyle = "black";
  }

  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.stroke();
  drawCtx.restore();
}

function drawFortress(fortress) {
  const width = fortress.width * scaleX;
  const height = fortress.height * scaleY;
  const x = fortress.position.x * scaleX;
  const y = fortress.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(fortress.angle); // Use the angle directly

  // Set color based on playerId
  if (fortress.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (fortress.playerId === PLAYER_TWO) {
    drawCtx.strokeStyle = "red";
  } else {
    drawCtx.strokeStyle = "black";
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-width / 2, -height / 2, width, height);
  drawCtx.restore();
}

function drawTurret(turret) {
  const radius = (turret.size / 2) * scaleX; // Assuming uniform scaling
  const x = turret.position.x * scaleX;
  const y = turret.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(turret.angle); // Use the angle directly

  // Set color based on playerId
  if (turret.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (turret.playerId === PLAYER_TWO) {
    drawCtx.strokeStyle = "red";
  } else {
    drawCtx.strokeStyle = "black";
  }

  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.stroke();
  drawCtx.restore();
}

//#endregion DRAWING FUNCTIONS

//#region NO-DRAW ZONE FUNCTIONS

function fortressNoDrawZone() {
  noDrawZones = []; // Reset the noDrawZones array

  fortresses.forEach((fortress) => {
    const zone = createRectangularZone(
      fortress.position.x,
      fortress.position.y,
      fortress.width,
      fortress.height,
      gameWorldHeight * 0.05 // Padding as 5% of game world height
    );
    // Add the no-draw zone to the array
    noDrawZones.push(zone);
  });
}

// Creates a rectangular no-drawn-zone with padding.
function createRectangularZone(centerX, centerY, width, height, padding) {
  const halfWidth = (width / 2 + padding) * scaleX;
  const halfHeight = (height / 2 + padding) * scaleY;

  return [
    { x: centerX * scaleX - halfWidth, y: centerY * scaleY - halfHeight }, // Top-Left
    { x: centerX * scaleX + halfWidth, y: centerY * scaleY - halfHeight }, // Top-Right
    { x: centerX * scaleX + halfWidth, y: centerY * scaleY + halfHeight }, // Bottom-Right
    { x: centerX * scaleX - halfWidth, y: centerY * scaleY + halfHeight }, // Bottom-Left
  ];
}

// Draw all no-draw zones on the drawing canvas.
function drawNoDrawZones() {
  drawCtx.strokeStyle = "rgba(255, 0, 0, 0.7)";
  drawCtx.lineWidth = 2;
  drawCtx.fillStyle = "rgba(255, 0, 0, 0.1)"; // Semi-transparent fill

  noDrawZones.forEach((zone) => {
    drawCtx.beginPath();
    drawCtx.moveTo(zone[0].x, zone[0].y);
    for (let i = 1; i < zone.length; i++) {
      drawCtx.lineTo(zone[i].x, zone[i].y);
    }
    drawCtx.closePath();
    drawCtx.fill();
    drawCtx.stroke();

    // Draw the X inside the rectangle.
    drawCtx.beginPath();
    // Diagonal from Top-Left to Bottom-Right.
    drawCtx.moveTo(zone[0].x, zone[0].y);
    drawCtx.lineTo(zone[2].x, zone[2].y);
    // Diagonal from Top-Right to Bottom-Left.
    drawCtx.moveTo(zone[1].x, zone[1].y);
    drawCtx.lineTo(zone[3].x, zone[3].y);
    drawCtx.strokeStyle = "rgba(255, 0, 0, 0.7)";
    drawCtx.lineWidth = 2;
    drawCtx.stroke();
  });
}

//#endregion NO-DRAW ZONE FUNCTIONS

//#region DRAWING PROCESS FUNCTIONS

// Handles completion of a drawing action.
function endDrawing() {
  // End drawing.
  isDrawing = false;

  // Proceed only if the drawing path has more than one point.
  if (drawingPath.length > 1) {
    const firstPoint = drawingPath[0]; // Starting point.
    const lastPoint = drawingPath[drawingPath.length - 1]; // Ending point.

    // Calculate the distance between first and last points.
    const distance = Math.hypot(lastPoint.x - firstPoint.x, lastPoint.y - firstPoint.y);

    // Threshold to determine if the shape should be closed.
    // Adjusted based on game units. Assuming scaleX and scaleY convert to game units.
    const snapThreshold = 10; // 10 game units

    if (distance <= snapThreshold) {
      // Snap the last point to the first point to close the shape.
      drawingPath[drawingPath.length - 1] = { x: firstPoint.x, y: firstPoint.y };
    } else {
      // Close the shape by connecting the last point to the first point.
      drawingPath.push({ x: firstPoint.x, y: firstPoint.y });
    }

    // Initialize overlap flag.
    let overlaps = false;

    // Check for overlaps with existing shapes in allPaths.
    for (let i = 0; i < allPaths.length; i++) {
      if (polygonsOverlap(drawingPath, allPaths[i].path)) {
        overlaps = true;
        break;
      }
    }

    // Check overlap with no-draw zones.
    if (!overlaps) {
      for (let i = 0; i < noDrawZones.length; i++) {
        if (polygonsOverlap(drawingPath, noDrawZones[i])) {
          overlaps = true;
          break;
        }
      }
    }

    if (overlaps) {
      // Alert the user about the invalid shape
      alert("Shapes cannot overlap, or be in no draw zones. Try drawing again.");

      // Clear the drawing.
      redrawCanvas();

      // Reset the drawingPath
      drawingPath = [];
      totalInkUsed = 0;
    } else {
      // Shape is valid, add it to allPaths.
      allPaths.push({ path: [...drawingPath], playerNumber });

      // Emit the valid shape to the server
      // The path is already in game units
      socket.emit("endDrawing", {
        roomID,
        playerNumber,
        path: drawingPath,
      });

      // Increment shape count for current player.
      if (playerNumber === PLAYER_ONE) {
        shapeCountPlayer1++;
        if (shapeCountPlayer1 >= maxShapesPerPlayer) {
          console.log(`Player ${PLAYER_ONE} has reached the maximum number of shapes.`);
        }
      } else if (playerNumber === PLAYER_TWO) {
        shapeCountPlayer2++;
        if (shapeCountPlayer2 >= maxShapesPerPlayer) {
          console.log(`Player ${PLAYER_TWO} has reached the maximum number of shapes.`);
        }
      }

      // Optionally update UI with shape counts
      updatePlayerShapeCount();

      // Clear the drawingPath for the next drawing
      drawingPath = [];
      totalInkUsed = 0;

      // Check if maximum total shapes have been drawn
      if (allPaths.length >= maxTotalShapes) {
        finalizeDrawingPhase();
      }

      // Redraw all shapes including the new one
      redrawCanvas();
    }
  }
}

// Function to start drawing process when mouse is pressed.
function startDrawing(event) {
  if (currentGameState !== GameState.PRE_GAME) {
    return;
  }

  const rect = drawCanvas.getBoundingClientRect();
  let mouseX = event.clientX - rect.left;
  let mouseY = event.clientY - rect.top;

  // Adjust mouse coordinates for player 2
  if (shouldRotateCanvas) {
    mouseX = drawCanvas.width - mouseX;
    mouseY = drawCanvas.height - mouseY;
  }

  // Convert mouse position from pixels to game units
  const mousePosition = { x: mouseX / scaleX, y: mouseY / scaleY };

  // Enforce drawing area per player.
  if (playerNumber === PLAYER_ONE) {
    // Player one draws below the dividing line.
    isDrawingBelow = true;
    mousePosition.y = Math.max(mousePosition.y, dividingLine / scaleY + dividingLineMargin / scaleY);
  } else if (playerNumber === PLAYER_TWO) {
    // Player two draws above the dividing line.
    isDrawingBelow = false;
    mousePosition.y = Math.min(mousePosition.y, dividingLine / scaleY - dividingLineMargin / scaleY);
  }

  // Clamp mouse position within drawable area horizontally.
  mousePosition.x = Math.max(
    drawingMarginX / scaleX,
    Math.min(mousePosition.x, (drawCanvas.width - drawingMarginX) / scaleX)
  );

  // Clamp mouse position within drawable area vertically.
  mousePosition.y = Math.max(
    drawingMarginY / scaleY,
    Math.min(mousePosition.y, (drawCanvas.height - drawingMarginY) / scaleY)
  );

  // Reset the total ink for the new drawing session.
  totalInkUsed = 0;

  // Set the drawing state to active.
  isDrawing = true;

  // Initialize the drawing path with the current mouse position.
  drawingPath = [mousePosition];

  // Emit startDrawing to server
  socket.emit("startDrawing", {
    roomID,
    playerNumber,
    position: mousePosition,
  });
}

// Handles drawing logic during mouse move events.
function draw(event) {
  if (currentGameState !== GameState.PRE_GAME) {
    return;
  }

  if (!isDrawing) {
    return;
  }

  const rect = drawCanvas.getBoundingClientRect();
  let mouseX = event.clientX - rect.left;
  let mouseY = event.clientY - rect.top;

  // Adjust mouse coordinates for player 2
  if (shouldRotateCanvas) {
    mouseX = drawCanvas.width - mouseX;
    mouseY = drawCanvas.height - mouseY;
  }

  // Convert mouse position from pixels to game units
  const mousePosition = { x: mouseX / scaleX, y: mouseY / scaleY };

  // Enforce drawing area per player.
  if (playerNumber === PLAYER_ONE) {
    mousePosition.y = Math.max(mousePosition.y, dividingLine / scaleY + dividingLineMargin / scaleY);
  } else if (playerNumber === PLAYER_TWO) {
    mousePosition.y = Math.min(mousePosition.y, dividingLine / scaleY - dividingLineMargin / scaleY);
  }

  // Clamp mouse position within drawable area horizontally.
  mousePosition.x = Math.max(
    drawingMarginX / scaleX,
    Math.min(mousePosition.x, (drawCanvas.width - drawingMarginX) / scaleX)
  );

  // Clamp mouse position within drawable area vertically.
  mousePosition.y = Math.max(
    drawingMarginY / scaleY,
    Math.min(mousePosition.y, (drawCanvas.height - drawingMarginY) / scaleY)
  );

  // Grab the last point in the current drawing path.
  const lastPoint = drawingPath[drawingPath.length - 1];

  // Calculate the difference in X and Y between the current and last points.
  const dx = mousePosition.x - lastPoint.x;
  const dy = mousePosition.y - lastPoint.y;

  // Calculate the segment length.
  const segmentLength = Math.hypot(dx, dy);

  // Increment total ink used by the length of the new segment.
  totalInkUsed += segmentLength;

  // Add the current mouse position to the drawing path.
  drawingPath.push(mousePosition);

  // Emit the drawing point to the server.
  socket.emit("drawing", {
    roomID,
    playerNumber,
    position: mousePosition,
  });

  // Redraw the canvas to include the new drawing
  redrawCanvas();
}

//#endregion DRAWING PROCESS FUNCTIONS

//#region UTILITY FUNCTIONS

// Get the current player's shape count
function getPlayerShapeCount() {
  return playerNumber === PLAYER_ONE ? shapeCountPlayer1 : playerNumber === PLAYER_TWO ? shapeCountPlayer2 : 0;
}

// Update player shape count UI or other elements if needed
function updatePlayerShapeCount() {
  // Implement UI updates if necessary
  // For example, display remaining shapes
  const remainingShapes = maxShapesPerPlayer - getPlayerShapeCount();
  statusText.textContent = `You are Player ${playerNumber}. Shapes left: ${remainingShapes}`;
  if (remainingShapes <= 0) {
    // Optionally disable drawing
    alert("You have reached the maximum number of shapes.");
  }
}

// Function to validate polygon overlap using the Separating Axis Theorem (SAT).
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

    // Normalize the axis
    const length = Math.hypot(axis.x, axis.y);
    const normalizedAxis = { x: axis.x / length, y: axis.y / length };

    // Project both polygons onto the axis
    const projectionA = project(polygonA, normalizedAxis);
    const projectionB = project(polygonB, normalizedAxis);

    // Check for overlap between projections
    if (projectionA.max < projectionB.min || projectionB.max < projectionA.min) {
      // No overlap on this axis, so polygons do not intersect
      return false;
    }
  }

  // Overlap on all axes, so polygons intersect
  return true;
}

// Function to finalize the drawing phase
function finalizeDrawingPhase() {
  currentGameState = GameState.GAME_RUNNING;
  socket.emit("finalizeDrawingPhase", { roomID });
  console.log("Drawing phase finalized. Game is now running.");
  // Additional logic to transition to game running can be added here
}

//#endregion UTILITY FUNCTIONS

//#endregion FUNCTIONS
