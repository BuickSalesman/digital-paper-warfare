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

let width = 10000; // Placeholder, will be updated
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

let drawingHistory = [];

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
  drawingHistory = [];
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

socket.on("drawing", (data) => {
  const { playerNumber: senderPlayer, from, to, color = "#000000", lineWidth = 2 } = data;

  const isValid = senderPlayer !== playerNumber && currentGameState === GameState.PRE_GAME;

  isValid &&
    (() => {
      const shouldTransform =
        (senderPlayer === PLAYER_ONE && playerNumber === PLAYER_TWO) ||
        (senderPlayer === PLAYER_TWO && playerNumber === PLAYER_ONE);

      drawingHistory.push({
        from,
        to,
        color,
        lineWidth,
        playerNumber: senderPlayer,
      });

      const canvasFrom = gameWorldToCanvas(from.x, from.y, shouldTransform, true);
      const canvasTo = gameWorldToCanvas(to.x, to.y, shouldTransform, true);

      drawLine(canvasFrom, canvasTo, color, lineWidth);
      drawDividingLine();
    })();
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

  drawingHistory.forEach((path, index) => {
    const shouldTransform =
      (path.playerNumber === PLAYER_ONE && playerNumber === PLAYER_TWO) ||
      (path.playerNumber === PLAYER_TWO && playerNumber === PLAYER_ONE);

    const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y, shouldTransform, true);
    const canvasTo = gameWorldToCanvas(path.to.x, path.to.y, shouldTransform, true);

    drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
  });
  drawDividingLine();
  drawCtx.restore();
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

function gameWorldToCanvas(x, y, shouldTransform = false, isIncoming = false) {
  let canvasX = x * scaleX;
  let canvasY = y * scaleY;

  if (shouldTransform) {
    canvasX = drawCanvas.width - canvasX;
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

function getTouchPos(touch) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
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
  currentDrawingStart = { x: pos.x, y: pos.y };

  // Reset total pixels drawn for the new drawing session
  totalPixelsDrawn = 0;
}

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

  // Calculate the distance between the last point and the current point
  const dx = currentX - lastX;
  const dy = currentY - lastY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  totalPixelsDrawn += distance;

  const gwFrom = canvasToGameWorld(lastX, lastY);
  const gwTo = canvasToGameWorld(currentX, currentY);

  drawLine({ x: lastX, y: lastY }, { x: currentX, y: currentY }, "#000000", 2);

  drawingHistory.push({
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
    playerNumber: playerNumber,
  });

  socket.emit("drawing", {
    from: gwFrom,
    to: gwTo,
    color: "#000000",
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

  // Log the total pixels drawn for this drawing session
  console.log(`Total pixels drawn: ${Math.round(totalPixelsDrawn)} pixels`);
}

function handleTouchStart(evt) {
  if (currentGameState !== GameState.PRE_GAME && currentGameState !== GameState.GAME_RUNNING) {
    return;
  }

  evt.preventDefault();
  if (evt.touches.length > 0) {
    const pos = getTouchPos(evt.touches[0]);

    if (!isWithinPlayerArea(pos.y)) {
      return;
    }

    isDrawing = true;
    lastX = pos.x;
    lastY = pos.y;
    currentDrawingStart = { x: pos.x, y: pos.y };

    // Reset total pixels drawn for the new drawing session
    totalPixelsDrawn = 0;
  }
}

function handleTouchMove(evt) {
  if (!isDrawing) {
    return;
  }
  evt.preventDefault();
  if (evt.touches.length > 0) {
    const pos = getTouchPos(evt.touches[0]);
    const currentX = pos.x;
    const currentY = pos.y;

    if (!isWithinPlayerArea(currentY)) {
      return;
    }

    // Calculate the distance between the last point and the current point
    const dx = currentX - lastX;
    const dy = currentY - lastY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    totalPixelsDrawn += distance;

    const gwFrom = canvasToGameWorld(lastX, lastY);
    const gwTo = canvasToGameWorld(currentX, currentY);

    drawLine({ x: lastX, y: lastY }, { x: currentX, y: currentY }, "#000000", 2);

    drawingHistory.push({
      from: gwFrom,
      to: gwTo,
      color: "#000000",
      lineWidth: 2,
      playerNumber: playerNumber,
    });

    socket.emit("drawing", {
      from: gwFrom,
      to: gwTo,
      color: "#000000",
      lineWidth: 2,
    });

    lastX = currentX;
    lastY = currentY;
  }
}

function handleTouchEndCancel() {
  if (!isDrawing) {
    return;
  }
  isDrawing = false;

  // Log the total pixels drawn for this drawing session
  console.log(`Total pixels drawn: ${Math.round(totalPixelsDrawn)} pixels`);
}

function drawLine(fromCanvas, toCanvas, color, lineWidth) {
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

drawCanvas.addEventListener("touchstart", handleTouchStart, false);
drawCanvas.addEventListener("touchmove", handleTouchMove, false);
drawCanvas.addEventListener("touchend", handleTouchEndCancel, false);
drawCanvas.addEventListener("touchcancel", handleTouchEndCancel, false);

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
