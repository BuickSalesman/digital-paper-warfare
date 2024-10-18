//#region VARIABLES

//#region GAME AND PLAYER VARIABLES

// Player and Room Info
let playerNumber = null;
let roomID = null;

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

// Declare both canvases.
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

//Declare the end drawing button.
const endDrawButton = document.getElementById("endDrawButton");

// Declare the timer display.
const timerElement = document.getElementById("Timer");

//#endregion HTML ELEMENT VARIABLES

//#region CANVAS AND CONTEXT VARIABLES

// Declare height, width, and aspect ratio for the canvas.
const aspectRatio = 1 / 1.4142;
const baseHeight = Math.min(window.innerHeight * 0.95);
let width = baseHeight * aspectRatio;
let height = baseHeight;

// Set up gameContainer dimensions.
gameContainer.style.width = `${width}px`;
gameContainer.style.height = `${height}px`;

// Declare contexts for drawing canvas.
const drawCtx = drawCanvas.getContext("2d");

// Set canvas size.
drawCanvas.width = width;
drawCanvas.height = height;

// Declare a dividing line halfway between the top and bottom of the canvas.
const dividingLine = drawCanvas.height / 2;

//#endregion CANVAS AND CONTEXT VARIABLES

//#region BODY VARIABLES
//#endregion BODY VARIABLES

//#region SOCKET VARIABLES
const socket = io();
//#endregion SOCKET VARIABLE

//#endregion VARIABLES

//#region SOCKET EVENTS

// Assuming 'socket' is your Socket.IO client instance
socket.emit("clientDimensions", { width, height });

//#region SOCKET.ON
// Receive Player Info
socket.on("playerInfo", (data) => {
  playerNumber = data.playerNumber;
  roomID = data.roomID;
  statusText.textContent = `You are Player ${playerNumber}`;
});

socket.on("dimensionsConfirmed", ({ width: serverWidth, height: serverHeight }) => {
  // Adjust canvas if necessary
  if (width !== serverWidth || height !== serverHeight) {
    // Update local dimensions
    width = serverWidth;
    height = serverHeight;

    // Update canvas sizes
    gameContainer.style.width = `${width}px`;
    gameContainer.style.height = `${height}px`;
    drawCanvas.width = width;
    drawCanvas.height = height;
  }
});

// Handle Game Start
socket.on("startGame", (data) => {
  if (playerNumber === 1 || playerNumber === 2) {
    startGame();
  }
});

// Handle Player Disconnection
socket.on("playerDisconnected", (number) => {
  statusText.textContent = `Player ${number} disconnected. Waiting for a new player...`;
  joinButton.disabled = false;
  // Optionally, stop the game loop or reset the game state
});

//#endregion SOCKET.ON

//#endregion SOCKET EVENTS

//#region EVENT HANDLERS

//#region WINDOW EVENT HANDLERS

//#endregion WINDOW EVENT HANDLERS
// Handle Window Resize
window.addEventListener("resize", resizeCanvas);
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

//#endregion BUTTON EVENT HANDLERS

//#endregion EVENT HANDLERS

//#region FUNCTIONS

//#region GAME STATE FUNCTIONS
// Function to Start the Game
function startGame() {
  // Hide Landing Page and Show Game Canvas
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";

  // Adjust canvas dimensions to match the gameContainer
  resizeCanvas();

  // Start the rendering loop
  requestAnimationFrame(render);
}
//#endregion GAME STATE FUNCTIONS

//#region RENDERING FUNCTIONS
// Function to Render the Game State
function render() {
  // Clear the canvas
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Continue the loop
  requestAnimationFrame(render);
}

// Function to Resize Canvas
function resizeCanvas() {
  const rect = gameContainer.getBoundingClientRect();
  drawCanvas.width = rect.width;
  drawCanvas.height = rect.height;
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
//#endregion DRAWING FUNCTIONS

//#endregion FUNCTIONS
