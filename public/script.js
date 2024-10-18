const socket = io();

const ctx = canvas.getContext("2d");

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
socket.on("stateUpdate", (state) => {});

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

  // Continue the loop
  requestAnimationFrame(render);
}

// Function to Draw Boundaries (Optional)
function drawBoundaries() {
  ctx.strokeStyle = "#000000";
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

  // Emit the force to the server with player number
  // socket.emit("applyForce", { playerNumber, force });
});
