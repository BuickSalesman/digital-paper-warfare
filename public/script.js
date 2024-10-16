// public/script.js

const socket = io();

// DOM Elements
const landingPage = document.getElementById("landing-page");
const joinButton = document.getElementById("join-button");
const statusText = document.getElementById("status");
const gameContainer = document.getElementById("game-container");
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// Player Number
let playerNumber = null;

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

// Receive Player Number
socket.on("playerNumber", (number) => {
  playerNumber = number;
  statusText.textContent = `You are Player ${playerNumber}`;
});

// Handle Game Start
socket.on("startGame", (data) => {
  if (playerNumber === 1 || playerNumber === 2) {
    startGame();
  }
});

// Handle Game Full
socket.on("gameFull", () => {
  statusText.textContent = "Game is full. Please try again later.";
  joinButton.disabled = true;
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
  gameContainer.style.display = "block";

  // Set canvas dimensions
  canvas.width = 800;
  canvas.height = 600;

  // Start the rendering loop
  requestAnimationFrame(render);
}

// Function to Render the Game State
function render() {
  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw boundaries (optional: for visual reference)
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
  ctx.beginPath();
  ctx.arc(position.x, position.y, 30, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.closePath();
}

// Function to Draw Boundaries (Optional)
function drawBoundaries() {
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;

  // Ground
  ctx.beginPath();
  ctx.moveTo(0, 600);
  ctx.lineTo(800, 600);
  ctx.stroke();
  ctx.closePath();

  // Ceiling
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(800, 0);
  ctx.stroke();
  ctx.closePath();

  // Left Wall
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 600);
  ctx.stroke();
  ctx.closePath();

  // Right Wall
  ctx.beginPath();
  ctx.moveTo(800, 0);
  ctx.lineTo(800, 600);
  ctx.stroke();
  ctx.closePath();
}

// Handle User Input (Mouse Click)
canvas.addEventListener("mousedown", (event) => {
  if (!playerNumber) return;

  // Calculate mouse position relative to the canvas
  const rect = canvas.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

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
      x: (mouseX - targetBall.x) * 0.0005, // Adjust scaling factor as needed
      y: (mouseY - targetBall.y) * 0.0005,
    };

    // Emit the force to the server with player number
    socket.emit("applyForce", { playerNumber, force });
  }
});
