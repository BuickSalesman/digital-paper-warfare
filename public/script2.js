//#region HTML ELEMENT VARIABLES

let playerNumber = null;
let roomID = null;
let renderingStarted = false;

// Game world dimensions received from the server
let gameWorldWidth = null;
let gameWorldHeight = null;

// Scaling factors
let scaleX = 1;
let scaleY = 1;

// Flag to indicate if the canvas should be rotated
let shouldRotateCanvas = false;

// Drawing Variables
const GameState = {
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
};
let currentGameState = GameState.PRE_GAME;

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

//#region SOCKET VARIABLES
const socket = io();
//#endregion SOCKET VARIABLES

//#region DRAWING STATE VARIABLES
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// Drawing history to persist drawings
let drawingHistory = [];
//#endregion DRAWING STATE VARIABLES

window.addEventListener("load", () => {
  console.log("Window loaded. Initializing canvas.");
  initializeCanvas();
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
    redrawAllDrawings();
  }
}

window.addEventListener("resize", resizeCanvas);

// Receive Player Info
socket.on("playerInfo", (data) => {
  console.log("Received 'playerInfo' from server:", data);
  playerNumber = data.playerNumber;
  roomID = data.roomID;
  statusText.textContent = `You are Player ${playerNumber}`;

  // Determine if the canvas should be rotated
  if (playerNumber === PLAYER_TWO) {
    shouldRotateCanvas = true;
    console.log("Player is Player 2. Incoming drawings will be rotated.");
  } else {
    console.log("Player is Player 1. Incoming drawings will not be rotated.");
  }

  // Initialize currentPlayerDrawing based on playerNumber
  console.log(`Player ${playerNumber} joined room ${roomID}`);
});

// Handle Game Start
socket.on("startGame", (data) => {
  console.log("Received 'startGame' from server:", data);
  if (playerNumber === PLAYER_ONE || playerNumber === PLAYER_TWO) {
    // Receive game world dimensions from server
    gameWorldWidth = data.gameWorld.width;
    gameWorldHeight = data.gameWorld.height;
    console.log(`Game World Dimensions - Width: ${gameWorldWidth}, Height: ${gameWorldHeight}`);

    // Update scaling factors
    updateScalingFactors();

    startGame();
  }
});

// Handle initial game state
socket.on("initialGameState", (data) => {
  console.log("Received 'initialGameState' from server:", data); // Debugging statement

  // Start rendering if not already started
  if (!renderingStarted) {
    renderingStarted = true;
    console.log("Starting rendering loop.");
    // Removed render loop to prevent canvas from being continuously cleared
    // Instead, manage drawings directly
  }
});

// Handle game updates
socket.on("gameUpdate", (data) => {
  console.log("Received 'gameUpdate' from server:", data);
  //code
});

// Handle Player Disconnection
socket.on("playerDisconnected", (number) => {
  console.log(`Received 'playerDisconnected' from server: Player ${number}`);
  statusText.textContent = `Player ${number} disconnected. Waiting for a new player...`;
  joinButton.disabled = false;
  // Optionally, stop the game loop or reset the game state
});

// Handle Drawing Data from Other Player
socket.on("drawing", (data) => {
  console.log("Received 'drawing' from server:", data);
  const { playerNumber: senderPlayer, from, to, color, lineWidth } = data;

  // Only draw if the sender is the other player
  if (senderPlayer !== playerNumber) {
    console.log(`Drawing from Player ${senderPlayer}: from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`);

    // If this client should rotate the canvas, transform the coordinates
    let transformedFrom = { ...from };
    let transformedTo = { ...to };

    if (shouldRotateCanvas) {
      transformedFrom = rotatePoint(from);
      transformedTo = rotatePoint(to);
      console.log(
        `Transformed Coordinates for Rotation: from (${transformedFrom.x}, ${transformedFrom.y}) to (${transformedTo.x}, ${transformedTo.y})`
      );
    }

    // Add to drawing history
    drawingHistory.push({
      from: transformedFrom,
      to: transformedTo,
      color: color || "#000000",
      lineWidth: lineWidth || 2,
    });

    // Draw the line segment
    drawLine(transformedFrom, transformedTo, color, lineWidth);
  } else {
    console.log("Received own 'drawing' data. Ignoring.");
  }
});

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  console.log("Join button clicked. Emitting 'joinGame' to server.");
  socket.emit("joinGame");
  statusText.textContent = "Waiting for another player...";
  joinButton.disabled = true;
});

// Function to Start the Game
function startGame() {
  console.log("Starting game. Updating UI.");
  // Hide Landing Page and Show Game Canvas
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";
  currentGameState = GameState.GAME_RUNNING;
}

// Function to Redraw All Drawings from History
function redrawAllDrawings() {
  console.log("Redrawing all drawings from history.");
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawingHistory.forEach((path) => {
    drawLine(path.from, path.to, path.color, path.lineWidth);
  });
}

// Function to Resize Canvas while maintaining aspect ratio
function resizeCanvas() {
  console.log("Window resized. Resizing canvas.");
  // Re-initialize canvas dimensions
  initializeCanvas();

  // Update scaling factors
  if (gameWorldWidth && gameWorldHeight) {
    updateScalingFactors();
    redrawAllDrawings();
  }
}

// Function to Update Scaling Factors
function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
  console.log(`Updated scaling factors: scaleX=${scaleX}, scaleY=${scaleY}`);
}

//#region DRAWING FUNCTIONS

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
  if (currentGameState !== GameState.GAME_RUNNING) {
    console.log("Game not running. Ignoring mouse down.");
    return;
  }

  isDrawing = true;
  const pos = getMousePos(evt);
  lastX = pos.x;
  lastY = pos.y;
  console.log(`Mouse down at (${lastX}, ${lastY}). Started drawing.`);
}

// Function to handle mouse move event
function handleMouseMove(evt) {
  if (!isDrawing) return;
  const pos = getMousePos(evt);
  const currentX = pos.x;
  const currentY = pos.y;

  console.log(
    `Mouse move to (${currentX}, ${currentY}). Drawing line from (${lastX}, ${lastY}) to (${currentX}, ${currentY}).`
  );

  // Draw the line locally
  drawLine({ x: lastX, y: lastY }, { x: currentX, y: currentY }, "#000000", 2);

  // Add to drawing history
  drawingHistory.push({
    from: { x: lastX, y: lastY },
    to: { x: currentX, y: currentY },
    color: "#000000",
    lineWidth: 2,
  });

  // Emit the drawing data to the server
  socket.emit("drawing", {
    from: { x: lastX, y: lastY },
    to: { x: currentX, y: currentY },
    color: "#000000", // You can extend this to allow color selection
    lineWidth: 2, // You can extend this to allow line width selection
  });
  console.log("Emitted 'drawing' event to server:", {
    from: { x: lastX, y: lastY },
    to: { x: currentX, y: currentY },
    color: "#000000",
    lineWidth: 2,
  });

  // Update last positions
  lastX = currentX;
  lastY = currentY;
}

// Function to handle mouse up and mouse out events
function handleMouseUpOut() {
  if (!isDrawing) return;
  isDrawing = false;
  console.log("Mouse up or out. Stopped drawing.");
}

// Function to handle touch start event
function handleTouchStart(evt) {
  if (currentGameState !== GameState.GAME_RUNNING) {
    console.log("Game not running. Ignoring touch start.");
    return;
  }

  evt.preventDefault();
  if (evt.touches.length > 0) {
    isDrawing = true;
    const pos = getTouchPos(evt.touches[0]);
    lastX = pos.x;
    lastY = pos.y;
    console.log(`Touch start at (${lastX}, ${lastY}). Started drawing.`);
  }
}

// Function to handle touch move event
function handleTouchMove(evt) {
  if (!isDrawing) return;
  evt.preventDefault();
  if (evt.touches.length > 0) {
    const pos = getTouchPos(evt.touches[0]);
    const currentX = pos.x;
    const currentY = pos.y;

    console.log(
      `Touch move to (${currentX}, ${currentY}). Drawing line from (${lastX}, ${lastY}) to (${currentX}, ${currentY}).`
    );

    // Draw the line locally
    drawLine({ x: lastX, y: lastY }, { x: currentX, y: currentY }, "#000000", 2);

    // Add to drawing history
    drawingHistory.push({
      from: { x: lastX, y: lastY },
      to: { x: currentX, y: currentY },
      color: "#000000",
      lineWidth: 2,
    });

    // Emit the drawing data to the server
    socket.emit("drawing", {
      from: { x: lastX, y: lastY },
      to: { x: currentX, y: currentY },
      color: "#000000",
      lineWidth: 2,
    });
    console.log("Emitted 'drawing' event to server:", {
      from: { x: lastX, y: lastY },
      to: { x: currentX, y: currentY },
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
  if (!isDrawing) return;
  isDrawing = false;
  console.log("Touch end or cancel. Stopped drawing.");
}

// Function to draw a line on the canvas
function drawLine(from, to, color, lineWidth) {
  drawCtx.beginPath();
  drawCtx.moveTo(from.x, from.y);
  drawCtx.lineTo(to.x, to.y);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = lineWidth;
  drawCtx.stroke();
  drawCtx.closePath();
  console.log(
    `Drew line from (${from.x}, ${from.y}) to (${to.x}, ${to.y}) with color ${color} and lineWidth ${lineWidth}.`
  );
}

// Function to rotate a point 180 degrees around the center of the canvas
function rotatePoint(point) {
  const rotatedX = drawCanvas.width - point.x;
  const rotatedY = drawCanvas.height - point.y;
  console.log(`Rotated point (${point.x}, ${point.y}) to (${rotatedX}, ${rotatedY})`);
  return {
    x: rotatedX,
    y: rotatedY,
  };
}

//#endregion DRAWING FUNCTIONS

//#region EVENT LISTENERS FOR DRAWING

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

//#endregion EVENT LISTENERS FOR DRAWING

//#region ADDITIONAL FUNCTIONS

// Rules Modal Functionality
rulesButton.addEventListener("click", () => {
  console.log("Rules button clicked. Displaying rules modal.");
  rulesModal.style.display = "flex";
});

closeButton.addEventListener("click", () => {
  console.log("Close button clicked. Hiding rules modal.");
  rulesModal.style.display = "none";
});

//#endregion ADDITIONAL FUNCTIONS
