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

// Declare gameAndPowerContainer element.
const gameAndPowerContainer = document.getElementById("gameAndPowerContainer");

// Declare gameContainer element.
const gameContainer = document.getElementById("gameContainer");

// Declare the canvas.
const drawCanvas = document.getElementById("drawCanvas"); // For drawing.

// CANVAS AND CONTEXT VARIABLES

// Declare contexts for drawing canvas.
const drawCtx = drawCanvas.getContext("2d");

// SOCKET VARIABLES
/* global io */
const socket = io();

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

  // Update scaling factors
  updateScalingFactors();
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

  // Reset game state variables
  currentGameState = GameState.LOBBY;

  // Clear roomID and playerNumber to allow rejoining
  roomID = null;
  playerNumber = null;
  gameWorldWidth = null;
  gameWorldHeight = null;
});

// Handle 'gameFull' event
socket.on("gameFull", () => {
  joinButton.disabled = false;
});

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  socket.emit("joinGame");
  joinButton.disabled = true;
  currentGameState = GameState.LOBBY; // Remain in LOBBY until PRE_GAME
});

// Function to Resize Canvas while maintaining aspect ratio
function resizeCanvas() {
  // Re-initialize canvas dimensions
  initializeCanvas();
}

// Function to Update Scaling Factors
function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
}
