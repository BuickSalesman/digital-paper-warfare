const socket = io();

// DOM Elements
const landingPage = document.getElementById("landing-page");
const joinButton = document.getElementById("join-button");
const statusText = document.getElementById("status");
const gameAndPowerContainer = document.getElementById("gameAndPowerContainer");
const gameContainer = document.getElementById("gameContainer");
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// Player and Room Info
let playerNumber = null;
let roomID = null;

// Game State
let gameState = {
  player1: { position: { x: 300, y: 300 }, velocity: { x: 0, y: 0 } },
  player2: { position: { x: 500, y: 300 }, velocity: { x: 0, y: 0 } },
};

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  socket.emit("joinGame");
  statusText.textContent = "Waiting for another player...";
  joinButton.disabled = true;
});

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

// Handle Player Disconnection
socket.on("playerDisconnected", (number) => {
  statusText.textContent = `Player ${number} disconnected. Waiting for a new player...`;
  joinButton.disabled = false;
  // Optionally, stop the game loop or reset the game state
});

// Handle State Updates from Server
socket.on("stateUpdate", (state) => {
  gameState = state;
});

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

// Function to Resize Canvas
function resizeCanvas() {
  const rect = gameContainer.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

// Function to Render the Game State
function render() {
  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw boundaries (optional)
  drawBoundaries();

  // Draw Player 1's Ball
  drawBall(gameState.player1.position, "#FF0000");

  // Draw Player 2's Ball
  drawBall(gameState.player2.position, "#0000FF");

  // Continue the loop
  requestAnimationFrame(render);
}

// Function to Draw a Ball
function drawBall(position, color) {
  // Adjust position based on canvas scaling
  const scaleX = canvas.width / 800; // Original width is 800
  const scaleY = canvas.height / 600; // Original height is 600

  ctx.beginPath();
  ctx.arc(position.x * scaleX, position.y * scaleY, 30 * scaleX, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.closePath();
}

// Function to Draw Boundaries (Optional)
function drawBoundaries() {
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;

  // Adjust scaling
  const scaleX = canvas.width / 800;
  const scaleY = canvas.height / 600;

  // Ground
  ctx.beginPath();
  ctx.moveTo(0, 600 * scaleY);
  ctx.lineTo(800 * scaleX, 600 * scaleY);
  ctx.stroke();
  ctx.closePath();

  // Ceiling
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(800 * scaleX, 0);
  ctx.stroke();
  ctx.closePath();

  // Left Wall
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 600 * scaleY);
  ctx.stroke();
  ctx.closePath();

  // Right Wall
  ctx.beginPath();
  ctx.moveTo(800 * scaleX, 0);
  ctx.lineTo(800 * scaleX, 600 * scaleY);
  ctx.stroke();
  ctx.closePath();
}

// Handle Window Resize
window.addEventListener("resize", resizeCanvas);

// Handle User Input (Mouse Click)
canvas.addEventListener("mousedown", (event) => {
  if (!playerNumber) return;

  // Calculate mouse position relative to the canvas
  const rect = canvas.getBoundingClientRect();
  const mouseX = (event.clientX - rect.left) * (800 / canvas.width);
  const mouseY = (event.clientY - rect.top) * (600 / canvas.height);

  // Determine which ball the player can interact with
  let targetBall = null;
  if (playerNumber === 1) {
    targetBall = gameState.player1.position;
  } else if (playerNumber === 2) {
    targetBall = gameState.player2.position;
  }

  if (targetBall) {
    // Calculate force direction based on mouse position
    const force = {
      x: (mouseX - targetBall.x) * 0.0005,
      y: (mouseY - targetBall.y) * 0.0005,
    };

    // Emit the force to the server with player number
    socket.emit("applyForce", { playerNumber, force });
  }
});
