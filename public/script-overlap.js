/* global io */
const socket = io();

let playerNumber = null;

let roomID = null;

let renderingStarted = false;

let gameWorldHeight = null;

let gameWorldWidth = null;

let scaleX = 1;

let scaleY = 1;

const GameState = {
  LOBBY: "LOBBY",
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
};

let currentGameState = GameState.LOBBY;

let totalPixelsDrawn = 0;

let currentDrawingSessionId = null;

let width = 1885; // Placeholder, will be updated
let height = 1414; // Placeholder, will be updated

const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

const landingPage = document.getElementById("landing-page");

const joinButton = document.getElementById("join-button");

const statusText = document.getElementById("status");

const passcodeInput = document.getElementById("passcode-input");

const gameAndPowerContainer = document.getElementById("gameAndPowerContainer");

const gameContainer = document.getElementById("gameContainer");

const drawCanvas = document.getElementById("drawCanvas");
const powerMeterFill = document.getElementById("powerMeterFill");

const moveButton = document.getElementById("moveButton");

const shootButton = document.getElementById("shootButton");

const rulesButton = document.getElementById("rulzButton");

const closeButton = document.querySelector(".close-button");

const rulesModal = document.getElementById("rulesModal");

const endDrawButton = document.getElementById("endDrawButton");

const timerElement = document.getElementById("Timer");

const drawCtx = drawCanvas.getContext("2d");

let dividingLine;

let isDrawing = false;
let lastX = 0;
let lastY = 0;

let drawingHistory = { [PLAYER_ONE]: [], [PLAYER_TWO]: [] };

let currentDrawingStart = null;

// let shouldRotateCanvas = false

window.addEventListener("load", () => {});

window.addEventListener("resize", resizeCanvas);

function initializeCanvas() {
  if (!gameWorldWidth || !gameWorldHeight) {
    console.error("Game world dimensions are not set.");
    return;
  }

  const aspectRatio = gameWorldWidth / gameWorldHeight;
  const baseWidth = Math.min(window.innerWidth * 0.95, 10000);
  let canvasWidth = baseWidth;
  let canvasHeight = canvasWidth / aspectRatio;

  if (canvasHeight > window.innerHeight * 0.95) {
    canvasHeight = window.innerHeight * 0.95;
    canvasWidth = canvasHeight * aspectRatio;
  }

  gameContainer.style.width = `${canvasWidth}px`;
  gameContainer.style.height = `${canvasHeight}px`;

  drawCanvas.width = canvasWidth;
  drawCanvas.height = canvasHeight;

  width = canvasWidth;
  height = canvasHeight;

  dividingLine = drawCanvas.height / 2;

  updateScalingFactors();

  redrawCanvas();

  drawDividingLine();
}

socket.on("playerInfo", (data) => {
  playerNumber = data.playerNumber;
  roomID = data.roomID;
  gameWorldWidth = data.gameWorldWidth;
  gameWorldHeight = data.gameWorldHeight;
  statusText.textContent = `You are Player ${playerNumber}`;

  initializeCanvas();
});

socket.on("preGame", () => {
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";
  socket.emit("ready");
});

socket.on("startPreGame", () => {
  currentGameState = GameState.PRE_GAME;
});

function render() {
  // Redraw the canvas
  redrawCanvas();

  // Continue the loop
  requestAnimationFrame(render);
}

socket.on("playerDisconnected", (number) => {
  landingPage.style.display = "block";
  gameAndPowerContainer.style.display = "none";

  joinButton.disabled = false;
  passcodeInput.disabled = false;
  // passcodeInput = false
  passcodeInput.value = "";

  currentGameState = GameState.LOBBY;
  drawingHistory = {
    [PLAYER_ONE]: [],
    [PLAYER_TWO]: [],
  };

  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  roomID = null;
  playerNumber = null;
  gameWorldWidth = null;
  gameWorldHeight = null;
});

socket.on("gameFull", () => {
  alert("The game is full.");
  joinButton.disabled = false;
  // passcodeInput.disabled = false;
});

// In your client-side code
socket.on("drawingMirror", (data) => {
  const { playerNumber: senderPlayer, from, to, color = "#000000", lineWidth = 2, drawingSessionId } = data;

  // Add to the appropriate player's history
  drawingHistory[senderPlayer].push({
    from,
    to,
    color,
    lineWidth,
    playerNumber: senderPlayer,
    drawingSessionId: drawingSessionId,
  });

  const shouldTransform = senderPlayer !== playerNumber;

  const canvasFrom = gameWorldToCanvas(from.x, from.y, shouldTransform, true);
  const canvasTo = gameWorldToCanvas(to.x, to.y, shouldTransform, true);

  drawLine(canvasFrom, canvasTo, color, lineWidth);
  drawDividingLine();
});

// In your client-side code
socket.on("shapeClosed", (data) => {
  const { playerNumber: senderPlayer, closingLine, drawingSessionId } = data;

  const shouldTransform = senderPlayer !== playerNumber;

  // Add the closing line to the correct player's history
  drawingHistory[senderPlayer].push({
    from: closingLine.from,
    to: closingLine.to,
    color: closingLine.color,
    lineWidth: closingLine.lineWidth,
    playerNumber: senderPlayer,
    drawingSessionId: drawingSessionId,
  });

  // Draw the closing line
  const canvasFrom = gameWorldToCanvas(closingLine.from.x, closingLine.from.y, shouldTransform, true);
  const canvasTo = gameWorldToCanvas(closingLine.to.x, closingLine.to.y, shouldTransform, true);

  drawLine(canvasFrom, canvasTo, closingLine.color, closingLine.lineWidth);
  drawDividingLine();
});

socket.on("eraseDrawingSession", (data) => {
  const { drawingSessionId, playerNumber: senderPlayer } = data;

  // Remove the drawing session's segments from the correct player's history
  drawingHistory[senderPlayer] = drawingHistory[senderPlayer].filter(
    (segment) => segment.drawingSessionId !== drawingSessionId
  );

  // Redraw the canvas
  redrawCanvas();
});

joinButton.addEventListener("click", () => {
  const passcode = passcodeInput.value.trim();
  if (passcode) {
    if (/^[A-Za-z0-9]{6}$/.test(passcode)) {
      socket.emit("joinGame", { passcode });
    } else {
      alert("Passcode must be exactly 6 digits.");
      return;
    }
  } else {
    socket.emit("joinGame");
  }
  joinButton.disabled = true;
  passcodeInput.disabled = true;
  currentGameState = GameState.LOBBY;
});

function redrawCanvas() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Draw the opponent's drawings on the top half
  const opponentPlayerNumber = playerNumber === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;

  drawingHistory[opponentPlayerNumber].forEach((path) => {
    const isOpponentDrawing = true;

    const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y, isOpponentDrawing);
    const canvasTo = gameWorldToCanvas(path.to.x, path.to.y, isOpponentDrawing);

    drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
  });

  // Draw the local player's drawings on the bottom half
  drawingHistory[playerNumber].forEach((path) => {
    const isOpponentDrawing = false;

    const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y, isOpponentDrawing);
    const canvasTo = gameWorldToCanvas(path.to.x, path.to.y, isOpponentDrawing);

    drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
  });

  drawDividingLine();
}

function resizeCanvas() {
  initializeCanvas();
}

function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
  console.log(`Updated scaling factors: scaleX=${scaleX}, scaleY=${scaleY}`);
}

function canvasToGameWorld(x, y) {
  return {
    x: x / scaleX,
    y: y / scaleY,
  };
}

function gameWorldToCanvas(x, y, isOpponentDrawing = false) {
  let canvasX = x * scaleX;
  let canvasY = y * scaleY;

  if (isOpponentDrawing) {
    // Flip the Y coordinate to map opponent's bottom half to our top half
    canvasY = drawCanvas.height - canvasY;
  }

  return { x: canvasX, y: canvasY };
}

function getMousePos(evt) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
}

function handleMouseDown(evt) {
  if (currentGameState !== GameState.PRE_GAME && currentGameState !== GameState.GAME_RUNNING) {
    return;
  }

  const pos = getMousePos(evt);

  if (!isWithinPlayerArea(pos.y)) {
    return;
  }

  isDrawing = true;
  lastX = pos.x;
  lastY = pos.y;

  // Reset drawingLegally and color at the start of a new drawing
  drawingLegally = true;
  color = "#000000"; // Default color for legal drawing

  currentDrawingSessionId = `${playerNumber}-${Date.now()}-${Math.random()}`;

  const gwPos = canvasToGameWorld(pos.x, pos.y);
  socket.emit("startDrawing", { position: gwPos, drawingSessionId: currentDrawingSessionId });
}

let color = null;
let drawingLegally = true;

socket.on("drawingIllegally", (data) => {
  drawingLegally = false;
  color = "#FF0000";
});

function handleMouseMove(evt) {
  if (!isDrawing) {
    return;
  }

  const pos = getMousePos(evt);
  const currentX = pos.x;
  const currentY = pos.y;

  if (!isWithinPlayerArea(currentY)) {
    return;
  }

  const gwFrom = canvasToGameWorld(lastX, lastY);
  const gwTo = canvasToGameWorld(currentX, currentY);

  const drawColor = drawingLegally ? "#000000" : "#FF0000";

  // Draw locally
  drawLine({ x: lastX, y: lastY }, { x: currentX, y: currentY }, drawColor);

  // Add to the correct player's drawing history
  drawingHistory[playerNumber].push({
    from: gwFrom,
    to: gwTo,
    color: drawColor,
    lineWidth: 2, // Assuming lineWidth is 2
    playerNumber: playerNumber,
    drawingSessionId: currentDrawingSessionId,
  });

  // Send drawing data to server
  socket.emit("drawing", {
    drawingSessionId: currentDrawingSessionId,
    from: gwFrom,
    to: gwTo,
    color: drawColor,
    lineWidth: 2,
  });

  lastX = currentX;
  lastY = currentY;
}

function handleMouseUpOut() {
  if (!isDrawing) {
    return;
  }
  isDrawing = false;

  // Notify the server that the drawing has ended
  socket.emit("endDrawing");
}

function drawLine(fromCanvas, toCanvas, color = "#000000", lineWidth = 2) {
  drawCtx.beginPath();
  drawCtx.moveTo(fromCanvas.x, fromCanvas.y);
  drawCtx.lineTo(toCanvas.x, toCanvas.y);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = lineWidth;
  drawCtx.stroke();
}

drawCanvas.addEventListener("mousedown", handleMouseDown, false);
drawCanvas.addEventListener("mousemove", handleMouseMove, false);
drawCanvas.addEventListener("mouseup", handleMouseUpOut, false);
drawCanvas.addEventListener("mouseout", handleMouseUpOut, false);

function drawDividingLine() {
  drawCtx.beginPath();
  drawCtx.moveTo(0, dividingLine);
  drawCtx.lineTo(drawCanvas.width, dividingLine);
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.stroke();
  drawCtx.closePath();
}

function isWithinPlayerArea(y) {
  return y >= dividingLine;
}
