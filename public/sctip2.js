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

  // Start the game
});
//#endregion SOCKET.ON

//#endregion SOCKET EVENTS
