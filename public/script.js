// script.js or client.js

//#region VARIABLES

//#region GAME AND PLAYER VARIABLES

// Player and Room Info
let playerNumber = null;
let roomID = null;
let renderingStarted = false; // Flag to prevent multiple render loops

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
});

// Function to initialize canvas dimensions
function initializeCanvas() {
  // Declare height, width, and aspect ratio for the canvas.
  const aspectRatio = 1 / 1.4142; // A4 aspect ratio (taller than wide)
  const baseWidth = Math.min(window.innerWidth * 0.95); // Use 95% of window width
  let width = baseWidth;
  let height = width / aspectRatio; // Calculate height based on aspect ratio

  // Ensure height doesn't exceed window height
  if (height > window.innerHeight * 0.95) {
    height = window.innerHeight * 0.95;
    width = height * aspectRatio;
  }

  // Set up gameContainer dimensions.
  gameContainer.style.width = `${width}px`;
  gameContainer.style.height = `${height}px`;

  // Set canvas size.
  drawCanvas.width = width;
  drawCanvas.height = height;

  dividingLine = drawCanvas.height / 2;

  // Optionally, log the dimensions to verify
  console.log("Initial Canvas Width:", drawCanvas.width);
  console.log("Initial Canvas Height:", drawCanvas.height);
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
});

// Handle Game Start
socket.on("startGame", (data) => {
  if (playerNumber === 1 || playerNumber === 2) {
    startGame();
  }
});

// Handle dimensions confirmation from the server
socket.on("dimensionsConfirmed", ({ width, height }) => {
  // Adjust canvas dimensions to match the confirmed dimensions
  drawCanvas.width = width;
  drawCanvas.height = height;

  // Update gameContainer dimensions if necessary
  gameContainer.style.width = `${width}px`;
  gameContainer.style.height = `${height}px`;

  // Update dividingLine
  dividingLine = drawCanvas.height / 2;

  // Log the confirmed dimensions
  console.log("Confirmed Canvas Width:", drawCanvas.width);
  console.log("Confirmed Canvas Height:", drawCanvas.height);

  // Start rendering if not already started
  if (!renderingStarted) {
    renderingStarted = true;
    requestAnimationFrame(render);
  }
});

// Handle adjustCanvas event from server
socket.on("adjustCanvas", ({ width, height, message }) => {
  // Adjust canvas dimensions to match the server's dimensions
  drawCanvas.width = width;
  drawCanvas.height = height;

  // Update gameContainer dimensions if necessary
  gameContainer.style.width = `${width}px`;
  gameContainer.style.height = `${height}px`;

  // Update dividingLine
  dividingLine = drawCanvas.height / 2;

  // Log the adjustment
  console.log(message);

  // Optionally, display a message to the user
  statusText.textContent = message;
});

// Handle initial game state
socket.on("initialGameState", (data) => {
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;
});

// Handle game updates
socket.on("gameUpdate", (data) => {
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;
  shells = data.shells || []; // If shells are sent
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

//#endregion BUTTON EVENT HANDLERS

//#endregion EVENT HANDLERS

//#region FUNCTIONS

//#region GAME STATE FUNCTIONS

// Function to Start the Game
function startGame() {
  // Hide Landing Page and Show Game Canvas
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";

  // Send your initial dimensions to the server
  socket.emit("clientDimensions", { width: drawCanvas.width, height: drawCanvas.height });
}

//#endregion GAME STATE FUNCTIONS

//#region RENDERING FUNCTIONS

// Function to Render the Game State
function render() {
  // Clear the canvas
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Now draw everything using the original positions
  drawDividingLine();
  fortresses.forEach(drawFortress);
  reactors.forEach(drawReactor);
  turrets.forEach(drawTurret);
  tanks.forEach(drawTank);
  // Draw shells if applicable
  // shells.forEach(drawShell);

  // Continue the loop
  requestAnimationFrame(render);
}

// Function to Resize Canvas while maintaining aspect ratio
function resizeCanvas() {
  // Re-initialize canvas dimensions
  initializeCanvas();

  // Send updated dimensions to the server
  socket.emit("clientDimensions", { width: drawCanvas.width, height: drawCanvas.height });
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
  drawCtx.save();
  drawCtx.translate(tank.position.x, tank.position.y);
  drawCtx.rotate(tank.angle); // Use the angle directly
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-size / 2, -size / 2, size, size);
  drawCtx.restore();
}

function drawReactor(reactor) {
  const radius = reactor.size / 2;
  drawCtx.save();
  drawCtx.translate(reactor.position.x, reactor.position.y);
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.stroke();
  drawCtx.restore();
}

function drawFortress(fortress) {
  const width = fortress.width;
  const height = fortress.height;
  drawCtx.save();
  drawCtx.translate(fortress.position.x, fortress.position.y);
  drawCtx.rotate(fortress.angle); // Use the angle directly
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-width / 2, -height / 2, width, height);
  drawCtx.restore();
}

function drawTurret(turret) {
  const radius = turret.size / 2;
  drawCtx.save();
  drawCtx.translate(turret.position.x, turret.position.y);
  drawCtx.rotate(turret.angle); // Use the angle directly
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.stroke();
  drawCtx.restore();
}

//#endregion DRAWING FUNCTIONS

//#endregion FUNCTIONS
