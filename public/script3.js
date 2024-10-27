// Combined Client-Side Script

/* global io */
const socket = io();

let playerNumber = null;
let roomID = null;
let renderingStarted = false;

// Game world dimensions received from the server
let gameWorldWidth = null;
let gameWorldHeight = null;

// Scaling factors
let scaleX = 1;
let scaleY = 1;

// Drawing Variables
const GameState = {
  LOBBY: "LOBBY",
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
};
let currentGameState = GameState.LOBBY; // Initialize to LOBBY

// Shape Counters (for UI feedback)
let shapeCountPlayer1 = 0;
let shapeCountPlayer2 = 0;
const maxTotalShapes = 10;
const maxShapesPerPlayer = 5;

// Canvas dimensions (will be set dynamically)
let width = 10000; // Placeholder, will be updated
let height = 1414; // Placeholder, will be updated

// Define Player Constants
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// HTML ELEMENT VARIABLES

// Declare landing page.
const landingPage = document.getElementById("landing-page");

// Declare join button.
const joinButton = document.getElementById("join-button");

// Declare status text.
const statusText = document.getElementById("status");

// Declare passcode input.
const passcodeInput = document.getElementById("passcode-input");

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

// CANVAS AND CONTEXT VARIABLES

// Declare contexts for drawing canvas.
const drawCtx = drawCanvas.getContext("2d");

// Declare a dividing line halfway between the top and bottom of the canvas.
let dividingLine;

// DRAWING STATE VARIABLES
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Drawing history to persist drawings
let drawingHistory = [];

// Variables to track drawing sessions
let currentDrawingStart = null; // { x, y }

// Variables to store game objects
let tanks = [];
let reactors = [];
let fortresses = [];
let turrets = [];
let shells = []; // If shells are sent from the server

// No-Draw Zones
let noDrawZones = [];

// Flag to indicate if the canvas should be rotated
let shouldRotateCanvas = false;

// EVENT LISTENERS

// Wait for the window to fully load
window.addEventListener("load", () => {
  console.log("Window loaded. Awaiting playerInfo.");
  // Wait for 'playerInfo' before initializing canvas
});

// Resize canvas when the window is resized
window.addEventListener("resize", resizeCanvas);

// SOCKET EVENTS

// Receive Player Info
socket.on("playerInfo", (data) => {
  console.log("Received 'playerInfo' from server:", data);
  playerNumber = data.playerNumber;
  roomID = data.roomID;
  gameWorldWidth = data.gameWorldWidth;
  gameWorldHeight = data.gameWorldHeight;
  statusText.textContent = `You are Player ${playerNumber}`;

  console.log(`Player ${playerNumber} joined room ${roomID}`);
  // Now that we have game world dimensions, initialize the canvas
  initializeCanvas();

  // Determine if the canvas should be rotated
  if (playerNumber === PLAYER_TWO) {
    shouldRotateCanvas = true;
  }
});

// Handle Pre-Game Preparation
socket.on("preGame", () => {
  // Hide landing page and show game container
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";

  // Emit 'ready' to server indicating the client is ready
  socket.emit("ready");
});

// Handle Start of Pre-Game
socket.on("startPreGame", () => {
  currentGameState = GameState.PRE_GAME;
  // Update UI to reflect PRE_GAME state, e.g., hide waiting message
});

// Handle initial game state
socket.on("initialGameState", (data) => {
  console.log("Received initial game state:", data);
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
  console.log(`Received 'playerDisconnected' from server: Player ${number}`);

  // Reset UI to landing page
  landingPage.style.display = "block";
  gameAndPowerContainer.style.display = "none";

  // Enable the join button
  joinButton.disabled = false;
  passcodeInput.disabled = false;
  passcodeInput.value = "";

  // Reset game state variables
  currentGameState = GameState.LOBBY;
  drawingHistory = [];
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Clear roomID and playerNumber to allow rejoining
  roomID = null;
  playerNumber = null;
  gameWorldWidth = null;
  gameWorldHeight = null;
});

// Handle 'gameFull' event
socket.on("gameFull", () => {
  alert("The game is full.");
  joinButton.disabled = false;
  passcodeInput.disabled = false;
});

// Handle Drawing Data from Server
socket.on("drawing", (data) => {
  const { playerNumber: senderPlayer, from, to, color, lineWidth } = data;

  // Only process if the sender is the other player
  if (senderPlayer !== playerNumber) {
    // Add to drawing history
    drawingHistory.push({
      from,
      to,
      color,
      lineWidth,
      playerNumber: senderPlayer,
    });

    // Redraw the canvas
    redrawCanvas();
  }
});

// Handle Finalize Drawing Phase
socket.on("finalizeDrawingPhase", () => {
  currentGameState = GameState.GAME_RUNNING;
  // Additional logic to transition to game running can be added here
  console.log("Drawing phase finalized. Game is now running.");
});

// Receive Invalid Shape Notification
socket.on("invalidShape", (data) => {
  alert(data.message);
});

// BUTTON EVENT HANDLERS

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  const passcode = passcodeInput.value.trim();
  if (passcode) {
    // Validate that the passcode is exactly 6 letters and numbers
    if (/^[A-Za-z0-9]{6}$/.test(passcode)) {
      socket.emit("joinGame", { passcode });
    } else {
      alert("Passcode must be exactly 6 letters and numbers.");
      return;
    }
  } else {
    socket.emit("joinGame");
  }
  joinButton.disabled = true;
  passcodeInput.disabled = true;
  currentGameState = GameState.LOBBY; // Remain in LOBBY until PRE_GAME
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

// DRAWING EVENT HANDLERS

// Mouse Events
drawCanvas.addEventListener("mousedown", handleMouseDown, false);
drawCanvas.addEventListener("mousemove", handleMouseMove, false);
drawCanvas.addEventListener("mouseup", handleMouseUpOut, false);
drawCanvas.addEventListener("mouseout", handleMouseUpOut, false);

// Touch Events
drawCanvas.addEventListener("touchstart", handleTouchStart, false);
drawCanvas.addEventListener("touchmove", handleTouchMove, false);
drawCanvas.addEventListener("touchend", handleTouchEndCancel, false);
drawCanvas.addEventListener("touchcancel", handleTouchEndCancel, false);

// FUNCTIONS

// Function to initialize canvas dimensions
function initializeCanvas() {
  // Check if gameWorldWidth and gameWorldHeight are set
  if (!gameWorldWidth || !gameWorldHeight) {
    console.error("Game world dimensions are not set.");
    return;
  }

  // Declare height, width, and aspect ratio for the canvas.
  const aspectRatio = gameWorldWidth / gameWorldHeight; // Maintain aspect ratio based on game world
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

  // Define dividing line as halfway down the canvas
  dividingLine = drawCanvas.height / 2;

  // Update scaling factors
  updateScalingFactors();

  // Redraw existing drawings
  redrawCanvas();
}

// Function to Update Scaling Factors
function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
  console.log(`Updated scaling factors: scaleX=${scaleX}, scaleY=${scaleY}`);
}

// Function to Resize Canvas while maintaining aspect ratio
function resizeCanvas() {
  // Re-initialize canvas dimensions
  initializeCanvas();
}

// Function to redraw the canvas including all game elements and drawings
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
  // shells.forEach(drawShell); // If you have shell rendering

  // Draw no-draw zones
  drawNoDrawZones();

  // Draw allPaths from drawingHistory
  drawingHistory.forEach((drawing) => {
    const { from, to, color, lineWidth, playerNumber: senderPlayer } = drawing;

    // Determine if the drawing should be transformed
    const shouldTransform =
      (senderPlayer === PLAYER_ONE && playerNumber === PLAYER_TWO) ||
      (senderPlayer === PLAYER_TWO && playerNumber === PLAYER_ONE);

    // Convert to canvas coordinates
    const canvasFrom = gameWorldToCanvas(from.x, from.y, shouldTransform, true);
    const canvasTo = gameWorldToCanvas(to.x, to.y, shouldTransform, true);

    // Draw the line segment
    drawLine(canvasFrom, canvasTo, color, lineWidth);
  });

  drawCtx.restore();
}

// Function to Render the Game State
function render() {
  // Redraw the canvas
  redrawCanvas();

  // Continue the loop
  requestAnimationFrame(render);
}

// Utility function to convert canvas coordinates to game world coordinates
function canvasToGameWorld(x, y) {
  let gwX = x / scaleX;
  let gwY = y / scaleY;

  if (shouldRotateCanvas) {
    gwX = gameWorldWidth - gwX;
    gwY = gameWorldHeight - gwY;
  }

  return {
    x: gwX,
    y: gwY,
  };
}

// Utility function to convert game world coordinates to canvas coordinates with optional mirroring and flipping
function gameWorldToCanvas(x, y, shouldTransform = false) {
  let canvasX = x * scaleX;
  let canvasY = y * scaleY;

  if (shouldTransform) {
    canvasX = drawCanvas.width - canvasX;
    canvasY = drawCanvas.height - canvasY;
  }

  return { x: canvasX, y: canvasY };
}

// Utility function to get mouse position relative to canvas
function getMousePos(evt) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

// Utility function to get touch position relative to canvas
function getTouchPos(touch) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
}

// Function to handle mouse down event
function handleMouseDown(evt) {
  if (currentGameState !== GameState.PRE_GAME) {
    console.log("Game not in PRE_GAME state. Ignoring mouse down.");
    return;
  }

  const pos = getMousePos(evt);

  // Adjust mouse coordinates for player 2
  let mouseX = pos.x;
  let mouseY = pos.y;
  if (shouldRotateCanvas) {
    mouseX = drawCanvas.width - pos.x;
    mouseY = drawCanvas.height - pos.y;
  }

  // Enforce drawing within player's designated half
  if (!isWithinPlayerArea(mouseY)) {
    console.log(`Mouse down at (${pos.x}, ${pos.y}) is outside player's drawing area. Ignoring.`);
    return;
  }

  isDrawing = true;
  lastX = pos.x;
  lastY = pos.y;
  currentDrawingStart = { x: pos.x, y: pos.y }; // Record starting point

  // Convert to game world coordinates
  const gwPosition = canvasToGameWorld(mouseX, mouseY);

  // Emit startDrawing to server
  socket.emit("startDrawing", {
    position: gwPosition,
  });
}

// Function to handle mouse move event
function handleMouseMove(evt) {
  if (!isDrawing) {
    return;
  }
  const pos = getMousePos(evt);

  // Adjust mouse coordinates for player 2
  let currentX = pos.x;
  let currentY = pos.y;
  if (shouldRotateCanvas) {
    currentX = drawCanvas.width - pos.x;
    currentY = drawCanvas.height - pos.y;
  }

  // Enforce drawing within player's designated half
  if (!isWithinPlayerArea(currentY)) {
    console.log(`Mouse move to (${currentX}, ${currentY}) is outside player's drawing area. Ignoring.`);
    return;
  }

  // Convert canvas coordinates to game world coordinates
  const gwFrom = canvasToGameWorld(lastX, lastY);
  const gwTo = canvasToGameWorld(currentX, currentY);

  // Draw the line locally
  drawLine({ x: lastX, y: lastY }, { x: currentX, y: currentY }, "#000000", 2);

  // Add to drawing history in game world coordinates with playerNumber
  drawingHistory.push({
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
    playerNumber: playerNumber, // Add local player's number
  });

  // Emit the drawing data to the server in game world coordinates
  socket.emit("drawing", {
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
  });

  // Update last positions
  lastX = currentX;
  lastY = currentY;
}

// Function to handle mouse up and mouse out events
function handleMouseUpOut() {
  if (!isDrawing) {
    return;
  }
  isDrawing = false;
  snapCloseDrawing(); // Automatically snap close the drawing
}

// Function to handle touch start event
function handleTouchStart(evt) {
  if (currentGameState !== GameState.PRE_GAME) {
    console.log("Game not in PRE_GAME state. Ignoring touch start.");
    return;
  }

  evt.preventDefault();
  if (evt.touches.length > 0) {
    const pos = getTouchPos(evt.touches[0]);

    // Adjust touch coordinates for player 2
    let touchX = pos.x;
    let touchY = pos.y;
    if (shouldRotateCanvas) {
      touchX = drawCanvas.width - pos.x;
      touchY = drawCanvas.height - pos.y;
    }

    // Enforce drawing within player's designated half
    if (!isWithinPlayerArea(touchY)) {
      console.log(`Touch start at (${pos.x}, ${pos.y}) is outside player's drawing area. Ignoring.`);
      return;
    }

    isDrawing = true;
    lastX = pos.x;
    lastY = pos.y;
    currentDrawingStart = { x: pos.x, y: pos.y }; // Record starting point

    // Convert to game world coordinates
    const gwPosition = canvasToGameWorld(touchX, touchY);

    // Emit startDrawing to server
    socket.emit("startDrawing", {
      position: gwPosition,
    });
  }
}

// Function to handle touch move event
function handleTouchMove(evt) {
  if (!isDrawing) {
    return;
  }
  evt.preventDefault();
  if (evt.touches.length > 0) {
    const pos = getTouchPos(evt.touches[0]);

    // Adjust touch coordinates for player 2
    let currentX = pos.x;
    let currentY = pos.y;
    if (shouldRotateCanvas) {
      currentX = drawCanvas.width - pos.x;
      currentY = drawCanvas.height - pos.y;
    }

    // Enforce drawing within player's designated half
    if (!isWithinPlayerArea(currentY)) {
      console.log(`Touch move to (${currentX}, ${currentY}) is outside player's drawing area. Ignoring.`);
      return;
    }

    // Convert canvas coordinates to game world coordinates
    const gwFrom = canvasToGameWorld(lastX, lastY);
    const gwTo = canvasToGameWorld(currentX, currentY);

    // Draw the line locally
    drawLine({ x: lastX, y: lastY }, { x: currentX, y: currentY }, "#000000", 2);

    // Add to drawing history in game world coordinates with playerNumber
    drawingHistory.push({
      from: gwFrom,
      to: gwTo,
      color: "#000000",
      lineWidth: 2,
      playerNumber: playerNumber, // Add local player's number
    });

    // Emit the drawing data to the server in game world coordinates
    socket.emit("drawing", {
      position: gwTo,
    });

    // Update last positions
    lastX = currentX;
    lastY = currentY;
  }
}

// Function to handle touch end and touch cancel events
function handleTouchEndCancel() {
  if (!isDrawing) {
    return;
  }
  isDrawing = false;
  snapCloseDrawing(); // Automatically snap close the drawing
}

// Function to draw a line on the canvas
function drawLine(fromCanvas, toCanvas, color, lineWidth) {
  drawCtx.beginPath();
  drawCtx.moveTo(fromCanvas.x, fromCanvas.y);
  drawCtx.lineTo(toCanvas.x, toCanvas.y);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = lineWidth;
  drawCtx.stroke();
  drawCtx.closePath();
}

// Function to handle automatic snapping closure
function snapCloseDrawing() {
  if (!currentDrawingStart) {
    console.log("No active drawing session to close.");
    return;
  }

  // Get the starting point
  const startX = currentDrawingStart.x;
  const startY = currentDrawingStart.y;

  // Get the current ending point
  const endX = lastX;
  const endY = lastY;

  // Draw the closing line locally
  drawLine({ x: endX, y: endY }, { x: startX, y: startY }, "#000000", 2);

  // Convert canvas coordinates to game world coordinates
  const gwFrom = canvasToGameWorld(endX, endY);
  const gwTo = canvasToGameWorld(startX, startY);

  // Add the snapping line to drawing history with playerNumber
  drawingHistory.push({
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
    playerNumber: playerNumber,
  });

  // Emit the 'snapClose' event to the server
  socket.emit("snapClose", {
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
  });

  // Reset the drawing session
  currentDrawingStart = null;
}

// Function to Draw a Drawing Path from Server
function drawServerDrawing(path, drawingPlayerNumber) {
  if (path.length < 2) return;

  drawCtx.beginPath();
  const shouldTransform =
    (drawingPlayerNumber === PLAYER_ONE && playerNumber === PLAYER_TWO) ||
    (drawingPlayerNumber === PLAYER_TWO && playerNumber === PLAYER_ONE);

  const firstPoint = gameWorldToCanvas(path[0].x, path[0].y, shouldTransform);
  drawCtx.moveTo(firstPoint.x, firstPoint.y);

  for (let i = 1; i < path.length; i++) {
    const point = gameWorldToCanvas(path[i].x, path[i].y, shouldTransform);
    drawCtx.lineTo(point.x, point.y);
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

// Function to Draw the Dividing Line on the Canvas
function drawDividingLine() {
  drawCtx.beginPath();
  drawCtx.moveTo(0, dividingLine);
  drawCtx.lineTo(drawCanvas.width, dividingLine);
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.stroke();
  drawCtx.closePath();
}

// Function to Check if Y Coordinate is Within Player's Designated Area
function isWithinPlayerArea(y) {
  if (playerNumber === PLAYER_ONE) {
    // Player 1 draws below the dividing line
    return y >= dividingLine;
  } else if (playerNumber === PLAYER_TWO) {
    // Player 2 draws above the dividing line
    return y <= dividingLine;
  }
  return false;
}

// MODAL HELPER FUNCTIONS

// Function to open the rules modal.
function openModal() {
  rulesModal.style.display = "block";
}

// Function to close the rules modal.
function closeModal() {
  rulesModal.style.display = "none";
}

// DRAWING FUNCTIONS FOR GAME OBJECTS

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

// NO-DRAW ZONE FUNCTIONS

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

// Draw all no-draw zones on the drawing canvas.
function drawNoDrawZones() {
  drawCtx.strokeStyle = "rgba(255, 0, 0, 0.7)";
  drawCtx.lineWidth = 2;
  drawCtx.fillStyle = "rgba(255, 0, 0, 0.1)"; // Semi-transparent fill

  noDrawZones.forEach((zone) => {
    drawCtx.beginPath();
    const transformedPoints = zone.map((point) => {
      const shouldTransform = false;
      return gameWorldToCanvas(point.x, point.y, shouldTransform);
    });

    drawCtx.moveTo(transformedPoints[0].x, transformedPoints[0].y);
    for (let i = 1; i < transformedPoints.length; i++) {
      drawCtx.lineTo(transformedPoints[i].x, transformedPoints[i].y);
    }
    drawCtx.closePath();
    drawCtx.fill();
    drawCtx.stroke();

    // Draw the X inside the rectangle.
    drawCtx.beginPath();
    // Diagonal from Top-Left to Bottom-Right.
    drawCtx.moveTo(transformedPoints[0].x, transformedPoints[0].y);
    drawCtx.lineTo(transformedPoints[2].x, transformedPoints[2].y);
    // Diagonal from Top-Right to Bottom-Left.
    drawCtx.moveTo(transformedPoints[1].x, transformedPoints[1].y);
    drawCtx.lineTo(transformedPoints[3].x, transformedPoints[3].y);
    drawCtx.strokeStyle = "rgba(255, 0, 0, 0.7)";
    drawCtx.lineWidth = 2;
    drawCtx.stroke();
  });
}
