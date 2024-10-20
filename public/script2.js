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

//#region SOCKET VARIABLES
const socket = io();
//#endregion SOCKET VARIABLES

window.addEventListener("load", () => {
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
  }
}

window.addEventListener("resize", resizeCanvas);

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

  // Start rendering if not already started
  if (!renderingStarted) {
    renderingStarted = true;
    requestAnimationFrame(render);
  }
});

// Handle game updates
socket.on("gameUpdate", (data) => {
  //code
});

// Handle Player Disconnection
socket.on("playerDisconnected", (number) => {
  statusText.textContent = `Player ${number} disconnected. Waiting for a new player...`;
  joinButton.disabled = false;
  // Optionally, stop the game loop or reset the game state
});

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  socket.emit("joinGame");
  statusText.textContent = "Waiting for another player...";
  joinButton.disabled = true;
});

// Function to Start the Game
function startGame() {
  // Hide Landing Page and Show Game Canvas
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";
  currentGameState = GameState.PRE_GAME;
}

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

  drawCtx.restore();

  // Continue the loop
  requestAnimationFrame(render);
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

function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
}
