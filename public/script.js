// client.js

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
  const baseWidth = Math.min(window.innerWidth * 0.95, 10000); // Use 95% of window width or max 1000px
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
  if (playerNumber === 2) {
    shouldRotateCanvas = true;
  }
});

// Handle Game Start
socket.on("startGame", (data) => {
  if (playerNumber === 1 || playerNumber === 2) {
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

  drawCtx.restore();

  // Continue the loop
  requestAnimationFrame(render);
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
  if (tank.playerId === 1) {
    drawCtx.strokeStyle = "blue";
  } else if (tank.playerId === 2) {
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
  if (reactor.playerId === 1) {
    drawCtx.strokeStyle = "blue";
  } else if (reactor.playerId === 2) {
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
  if (fortress.playerId === 1) {
    drawCtx.strokeStyle = "blue";
  } else if (fortress.playerId === 2) {
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
  if (turret.playerId === 1) {
    drawCtx.strokeStyle = "blue";
  } else if (turret.playerId === 2) {
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

// Creates no-draw zones around fortresses to prevent overlapping drawings.
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

//#endregion FUNCTIONS
