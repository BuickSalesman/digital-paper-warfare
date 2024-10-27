// SOCKET VARIABLES
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

// Declare landing page.
const landingPage = document.getElementById("landing-page");

// Declare join button.
const joinButton = document.getElementById("join-button");

// Declare status text.
const statusText = document.getElementById("status");

// Declare passcode input.
let passcodeInput = document.getElementById("passcode-input");

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

// SOCKET VARIABLES

// DRAWING STATE VARIABLES
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Drawing history to persist drawings
let drawingHistory = [];

// Variables to track drawing sessions
let currentDrawingStart = null; // { x, y }

// Event Listeners for Window Load and Resize
window.addEventListener("load", () => {
  console.log("Window loaded. Awaiting playerInfo.");
  // Wait for 'playerInfo' before initializing canvas
});

window.addEventListener("resize", resizeCanvas);

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
  redrawAllDrawings();

  // Draw the dividing line
  drawDividingLine();
}

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
});

// Handle Pre-Game Preparation
socket.on("preGame", (data) => {
  // Hide landing page and show game container
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";

  // Emit 'ready' to server indicating the client is ready
  socket.emit("ready");
});

// Handle Start of Pre-Game
socket.on("startPreGame", (data) => {
  currentGameState = GameState.PRE_GAME;
  // Update UI to reflect PRE_GAME state, e.g., hide waiting message
});

// Handle Player Disconnection
socket.on("playerDisconnected", (number) => {
  console.log(`Received 'playerDisconnected' from server: Player ${number}`);

  // Reset UI to landing page
  landingPage.style.display = "block";
  gameAndPowerContainer.style.display = "none";

  // Enable the join button
  joinButton.disabled = false;
  passcodeInput = false;
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
});

// Handle Drawing Data from Other Player
socket.on("drawing", (data) => {
  console.log("Received 'drawing' from server:", data);
  const { playerNumber: senderPlayer, from, to, color, lineWidth } = data;

  // Only draw if the sender is the other player and game is in PRE_GAME
  if (senderPlayer !== playerNumber && currentGameState === GameState.PRE_GAME) {
    console.log(`Drawing from Player ${senderPlayer}: from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`);

    // Determine if the drawing should be mirrored and flipped
    const shouldTransform =
      (senderPlayer === PLAYER_ONE && playerNumber === PLAYER_TWO) ||
      (senderPlayer === PLAYER_TWO && playerNumber === PLAYER_ONE);

    // Add to drawing history in game world coordinates with sender's player number
    drawingHistory.push({
      from: from, // Store in game world coordinates
      to: to,
      color: color || "#000000",
      lineWidth: lineWidth || 2,
      playerNumber: senderPlayer, // Add sender's player number
    });

    // Convert to canvas coordinates for drawing
    const canvasFrom = gameWorldToCanvas(from.x, from.y, shouldTransform, true);
    const canvasTo = gameWorldToCanvas(to.x, to.y, shouldTransform, true);

    // Draw the line segment
    drawLine(canvasFrom, canvasTo, color, lineWidth);

    // Redraw the dividing line to ensure it's on top
    drawDividingLine();
  } else {
    console.log("Received own 'drawing' data or game not in PRE_GAME. Ignoring.");
  }
});

// Handle 'snapClose' event from server
socket.on("snapClose", (data) => {
  console.log("Received 'snapClose' from server:", data);
  const { playerNumber: senderPlayer, from, to, color, lineWidth } = data;

  // Only draw if the sender is the other player and game is in PRE_GAME
  if (senderPlayer !== playerNumber && currentGameState === GameState.PRE_GAME) {
    console.log(`Snap close from Player ${senderPlayer}: from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`);

    // Determine if the snapping line should be mirrored and flipped
    const shouldTransform =
      (senderPlayer === PLAYER_ONE && playerNumber === PLAYER_TWO) ||
      (senderPlayer === PLAYER_TWO && playerNumber === PLAYER_ONE);

    // Add to drawing history in game world coordinates with sender's player number
    drawingHistory.push({
      from: from, // Store in game world coordinates
      to: to,
      color: color || "#000000",
      lineWidth: lineWidth || 2,
      playerNumber: senderPlayer, // Add sender's player number
    });

    // Convert to canvas coordinates for drawing
    const canvasFrom = gameWorldToCanvas(from.x, from.y, shouldTransform, true);
    const canvasTo = gameWorldToCanvas(to.x, to.y, shouldTransform, true);

    // Draw the snapping line
    drawLine(canvasFrom, canvasTo, color, lineWidth);
    console.log(
      `Drew snapping line from (${canvasFrom.x}, ${canvasFrom.y}) to (${canvasTo.x}, ${canvasTo.y}) with color ${color} and lineWidth ${lineWidth}`
    );

    // Redraw the dividing line to ensure it's on top
    drawDividingLine();
  } else {
    console.log("Received own 'snapClose' data or game not in PRE_GAME. Ignoring.");
  }
});

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  const passcode = passcodeInput.value.trim();
  if (passcode) {
    // Validate that the passcode is exactly 6 digits
    if (/^\d{6}$/.test(passcode)) {
      socket.emit("joinGame", { passcode });
    } else {
      alert("Passcode must be exactly 6 digits.");
      return;
    }
  } else {
    socket.emit("joinGame");
  }
  joinButton.disabled = true;
  passcodeInput.disabled = true;
  currentGameState = GameState.LOBBY; // Remain in LOBBY until PRE_GAME
});

// Function to Redraw All Drawings from History
function redrawAllDrawings() {
  console.log("Redrawing all drawings from history.");
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Draw all lines from history
  drawingHistory.forEach((path, index) => {
    // Determine if the drawing should be mirrored and flipped
    const shouldTransform =
      (path.playerNumber === PLAYER_ONE && playerNumber === PLAYER_TWO) ||
      (path.playerNumber === PLAYER_TWO && playerNumber === PLAYER_ONE);

    // Convert to canvas coordinates with or without mirroring and flipping
    const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y, shouldTransform, true);
    const canvasTo = gameWorldToCanvas(path.to.x, path.to.y, shouldTransform, true);

    // Draw the line segment
    drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
    console.log(
      `Redrew path ${index + 1}: from (${canvasFrom.x}, ${canvasFrom.y}) to (${canvasTo.x}, ${canvasTo.y}) with color ${
        path.color
      } and lineWidth ${path.lineWidth}`
    );
  });

  // Draw the dividing line on top of all drawings
  drawDividingLine();
}

// Function to Resize Canvas while maintaining aspect ratio
function resizeCanvas() {
  // Re-initialize canvas dimensions
  initializeCanvas();
}

// Function to Update Scaling Factors
function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
  console.log(`Updated scaling factors: scaleX=${scaleX}, scaleY=${scaleY}`);
}

// DRAWING FUNCTIONS

// Utility function to convert canvas coordinates to game world coordinates
function canvasToGameWorld(x, y) {
  return {
    x: x / scaleX,
    y: y / scaleY,
  };
}

// Utility function to convert game world coordinates to canvas coordinates with optional mirroring and flipping
function gameWorldToCanvas(x, y, shouldTransform = false, isIncoming = false) {
  let canvasX = x * scaleX;
  let canvasY = y * scaleY;

  if (shouldTransform) {
    // Flip vertically and horizontally
    canvasX = drawCanvas.width - canvasX;
    canvasY = drawCanvas.height - canvasY;
    console.log(`Transformed canvas coordinates: (${canvasX}, ${canvasY}) for game world point (${x}, ${y})`);
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
  if (currentGameState !== GameState.PRE_GAME && currentGameState !== GameState.GAME_RUNNING) {
    console.log("Game not in PRE_GAME or GAME_RUNNING state. Ignoring mouse down.");
    return;
  }

  const pos = getMousePos(evt);

  // Enforce drawing within player's designated half
  if (!isWithinPlayerArea(pos.y)) {
    console.log(`Mouse down at (${pos.x}, ${pos.y}) is outside player's drawing area. Ignoring.`);
    return;
  }

  isDrawing = true;
  lastX = pos.x;
  lastY = pos.y;
  currentDrawingStart = { x: pos.x, y: pos.y }; // Record starting point
  console.log(`Mouse down at (${lastX}, ${lastY}). Started drawing.`);
}

// Function to handle mouse move event
function handleMouseMove(evt) {
  if (!isDrawing) {
    return;
  }
  const pos = getMousePos(evt);
  const currentX = pos.x;
  const currentY = pos.y;

  // Enforce drawing within player's designated half
  if (!isWithinPlayerArea(currentY)) {
    console.log(`Mouse move to (${currentX}, ${currentY}) is outside player's drawing area. Ignoring.`);
    return;
  }

  console.log(
    `Mouse move to (${currentX}, ${currentY}). Drawing line from (${lastX}, ${lastY}) to (${currentX}, ${currentY}).`
  );

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
    color: "#000000", // You can extend this to allow color selection
    lineWidth: 2, // You can extend this to allow line width selection
  });
  console.log("Emitted 'drawing' event to server:", {
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
  console.log("Mouse up or out. Stopped drawing.");
  snapCloseDrawing(); // Automatically snap close the drawing
}

// Function to handle touch start event
function handleTouchStart(evt) {
  if (currentGameState !== GameState.PRE_GAME && currentGameState !== GameState.GAME_RUNNING) {
    console.log("Game not in PRE_GAME or GAME_RUNNING state. Ignoring touch start.");
    return;
  }

  evt.preventDefault();
  if (evt.touches.length > 0) {
    const pos = getTouchPos(evt.touches[0]);

    // Enforce drawing within player's designated half
    if (!isWithinPlayerArea(pos.y)) {
      console.log(`Touch start at (${pos.x}, ${pos.y}) is outside player's drawing area. Ignoring.`);
      return;
    }

    isDrawing = true;
    lastX = pos.x;
    lastY = pos.y;
    currentDrawingStart = { x: pos.x, y: pos.y }; // Record starting point
    console.log(`Touch start at (${lastX}, ${lastY}). Started drawing.`);
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
    const currentX = pos.x;
    const currentY = pos.y;

    // Enforce drawing within player's designated half
    if (!isWithinPlayerArea(currentY)) {
      console.log(`Touch move to (${currentX}, ${currentY}) is outside player's drawing area. Ignoring.`);
      return;
    }

    console.log(
      `Touch move to (${currentX}, ${currentY}). Drawing line from (${lastX}, ${lastY}) to (${currentX}, ${currentY}).`
    );

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
    console.log("Emitted 'drawing' event to server:", {
      from: gwFrom,
      to: gwTo,
      color: "#000000",
      lineWidth: 2,
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
  console.log("Touch end or cancel. Stopped drawing.");
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
  console.log(
    `Drew line from (${fromCanvas.x}, ${fromCanvas.y}) to (${toCanvas.x}, ${toCanvas.y}) with color ${color} and lineWidth ${lineWidth}.`
  );
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

  console.log(`Snapping drawing closed from (${endX}, ${endY}) to (${startX}, ${startY}).`, currentGameState);

  // Draw the closing line locally
  drawLine({ x: endX, y: endY }, { x: startX, y: startY }, "#000000", 2); // Using default color for snapping

  // Convert canvas coordinates to game world coordinates
  const gwFrom = canvasToGameWorld(endX, endY);
  const gwTo = canvasToGameWorld(startX, startY);

  // Add the snapping line to drawing history with playerNumber
  drawingHistory.push({
    from: gwFrom,
    to: gwTo,
    color: "#000000", // Default color
    lineWidth: 2,
    playerNumber: playerNumber, // Add local player's number
  });

  console.log(
    `Added snapping line to history: from (${gwFrom.x}, ${gwFrom.y}) to (${gwTo.x}, ${gwTo.y}) with color #000000 and lineWidth 2.`
  );

  // Emit the 'snapClose' event to the server in game world coordinates
  socket.emit("snapClose", {
    from: gwFrom,
    to: gwTo,
    color: "#000000", // Default color
    lineWidth: 2,
  });
  console.log("Emitted 'snapClose' event to server:", {
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
  });

  // Reset the drawing session
  currentDrawingStart = null;

  // Redraw the dividing line to ensure it's on top
  drawDividingLine();
}

// ADDITIONAL FUNCTIONS

// Rules Modal Functionality
rulesButton.addEventListener("click", () => {
  console.log("Rules button clicked. Displaying rules modal.");
  rulesModal.style.display = "flex";
});

closeButton.addEventListener("click", () => {
  console.log("Close button clicked. Hiding rules modal.");
  rulesModal.style.display = "none";
});

// Event Listeners for Drawing

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

// Function to Draw the Dividing Line on the Canvas
function drawDividingLine() {
  drawCtx.beginPath();
  drawCtx.moveTo(0, dividingLine);
  drawCtx.lineTo(drawCanvas.width, dividingLine);
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.stroke();
  drawCtx.closePath();
  console.log(`Drew dividing line at Y = ${dividingLine}`);
}

// Function to Check if Y Coordinate is Within Player's Designated Area
function isWithinPlayerArea(y) {
  // Both players can only draw below the dividing line in their own view
  // No mirroring is applied to the entire canvas
  return y >= dividingLine;
}
