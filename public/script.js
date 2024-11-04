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
const removeDrawingButton = document.getElementById("removePreviousDrawingButton");
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

let drawingEnabled = true;
let drawingHistory = { [PLAYER_ONE]: [], [PLAYER_TWO]: [] };
let currentDrawingStart = null;

let tanks = [];
let reactors = [];
let fortresses = [];
let turrets = [];
let shells = [];

let noDrawZones = [];
const NO_DRAW_ZONE_PADDING_RATIO = 0.05;

// Event Listeners
window.addEventListener("load", () => {});
window.addEventListener("resize", resizeCanvas);

drawCanvas.addEventListener(
  "contextmenu",
  function (e) {
    e.preventDefault();
  },
  false
);

// Initialize Canvas
function initializeCanvas() {
  if (!gameWorldWidth || !gameWorldHeight) {
    console.error("Game world dimensions are not set.");
    return;
  }

  const aspectRatio = gameWorldWidth / gameWorldHeight;
  const baseWidth = Math.min(window.innerWidth * 0.95, 1885);
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

// Socket Events
socket.on("playerInfo", (data) => {
  playerNumber = data.playerNumber;
  roomID = data.roomID;
  gameWorldWidth = data.gameWorldWidth;
  gameWorldHeight = data.gameWorldHeight;

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

socket.on("initialGameState", (data) => {
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;

  fortressNoDrawZone();

  if (!renderingStarted) {
    renderingStarted = true;
    requestAnimationFrame(render);
  }
});

socket.on("gameUpdate", (data) => {
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;
  shells = data.shells || [];

  fortressNoDrawZone();
});

function render() {
  // Redraw the canvas
  redrawCanvas();

  // Continue the loop
  requestAnimationFrame(render);
}

socket.on("playerDisconnected", (number) => {
  // Reset client-side variables
  playerNumber = null;
  roomID = null;
  currentGameState = GameState.LOBBY;
  drawingHistory = {
    [PLAYER_ONE]: [],
    [PLAYER_TWO]: [],
  };

  // Clear the canvas
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Reset game entities
  tanks = [];
  reactors = [];
  fortresses = [];
  turrets = [];
  shells = [];
  noDrawZones = [];
  renderingStarted = false;

  // Reset UI elements
  landingPage.style.display = "block";
  gameAndPowerContainer.style.display = "none";

  joinButton.disabled = false;
  passcodeInput.disabled = false;
  passcodeInput.value = "";

  gameWorldWidth = null;
  gameWorldHeight = null;
  scaleX = 1;
  scaleY = 1;

  console.log(`Player ${number} disconnected. Resetting game state.`);
});

socket.on("gameFull", () => {
  alert("The game is full.");
  joinButton.disabled = false;
});

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

  const canvasFrom = gameWorldToCanvas(from.x, from.y);
  const canvasTo = gameWorldToCanvas(to.x, to.y);

  drawLine(canvasFrom, canvasTo, color, lineWidth);
  drawDividingLine();
});

socket.on("shapeClosed", (data) => {
  const { playerNumber: senderPlayer, closingLine, drawingSessionId } = data;

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
  const canvasFrom = gameWorldToCanvas(closingLine.from.x, closingLine.from.y);
  const canvasTo = gameWorldToCanvas(closingLine.to.x, closingLine.to.y);

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

socket.on("drawingDisabled", (data) => {
  drawingEnabled = false;
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

// Redraw Canvas Function
function redrawCanvas() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  drawCtx.save();
  let invertPlayerIds = false;
  if (playerNumber === PLAYER_TWO) {
    // Rotate the canvas by 180 degrees around its center
    drawCtx.translate(drawCanvas.width / 2, drawCanvas.height / 2);
    drawCtx.rotate(Math.PI);
    drawCtx.translate(-drawCanvas.width / 2, -drawCanvas.height / 2);
    invertPlayerIds = true;
  }

  // Draw the opponent's drawings
  const opponentPlayerNumber = playerNumber === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;

  drawingHistory[opponentPlayerNumber].forEach((path) => {
    const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y);
    const canvasTo = gameWorldToCanvas(path.to.x, path.to.y);

    drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
  });

  // Draw the local player's drawings
  drawingHistory[playerNumber].forEach((path) => {
    const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y);
    const canvasTo = gameWorldToCanvas(path.to.x, path.to.y);

    drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
  });

  drawDividingLine();
  fortresses.forEach((fortress) => drawFortress(fortress, invertPlayerIds));
  reactors.forEach((reactor) => drawReactor(reactor, invertPlayerIds));
  turrets.forEach((turret) => drawTurret(turret, invertPlayerIds));
  tanks.forEach((tank) => drawTank(tank, invertPlayerIds));
  drawNoDrawZones();

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

function gameWorldToCanvas(x, y) {
  return {
    x: x * scaleX,
    y: y * scaleY,
  };
}

function getMousePos(evt) {
  const rect = drawCanvas.getBoundingClientRect();
  let x = evt.clientX - rect.left;
  let y = evt.clientY - rect.top;

  if (playerNumber === PLAYER_TWO) {
    // Adjust for canvas rotation
    x = drawCanvas.width - x;
    y = drawCanvas.height - y;
  }

  return { x, y };
}

function handleMouseDown(evt) {
  if (evt.button !== 0 || !drawingEnabled) {
    return;
  }
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
  if (evt.buttons !== 1 || !drawingEnabled) {
    return;
  }

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
  if (playerNumber === PLAYER_TWO) {
    return y <= dividingLine;
  } else {
    return y >= dividingLine;
  }
}

function drawTank(tank, invertPlayerIds) {
  const size = tank.size;
  const x = tank.position.x * scaleX;
  const y = tank.position.y * scaleY;
  const scaledSize = size * scaleX;

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(tank.angle);

  // Adjust the player ID based on the invertPlayerIds flag
  let tankPlayerId = tank.playerId;
  if (invertPlayerIds) {
    tankPlayerId = tank.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  if (tankPlayerId === playerNumber) {
    drawCtx.strokeStyle = "blue"; // Own tank
  } else {
    drawCtx.strokeStyle = "red"; // Opponent's tank
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-scaledSize / 2, -scaledSize / 2, scaledSize, scaledSize);
  drawCtx.restore();
}

function drawReactor(reactor, invertPlayerIds) {
  const radius = (reactor.size / 2) * scaleX;
  const x = reactor.position.x * scaleX;
  const y = reactor.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);

  // Adjust the player ID based on the invertPlayerIds flag
  let reactorPlayerId = reactor.playerId;
  if (invertPlayerIds) {
    reactorPlayerId = reactor.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  if (reactorPlayerId === playerNumber) {
    drawCtx.strokeStyle = "blue"; // Own reactor
  } else {
    drawCtx.strokeStyle = "red"; // Opponent's reactor
  }

  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.stroke();
  drawCtx.restore();
}

function drawFortress(fortress, invertPlayerIds) {
  const width = fortress.width * scaleX;
  const height = fortress.height * scaleY;
  const canvasPos = gameWorldToCanvas(fortress.position.x, fortress.position.y);

  drawCtx.save();
  drawCtx.translate(canvasPos.x, canvasPos.y);
  drawCtx.rotate(fortress.angle);

  // Adjust the player ID based on the invertPlayerIds flag
  let fortressPlayerId = fortress.playerId;
  if (invertPlayerIds) {
    fortressPlayerId = fortress.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  if (fortressPlayerId === playerNumber) {
    drawCtx.strokeStyle = "blue"; // Own fortress
  } else {
    drawCtx.strokeStyle = "red"; // Opponent's fortress
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-width / 2, -height / 2, width, height);
  drawCtx.restore();
}

function drawTurret(turret, invertPlayerIds) {
  const radius = (turret.size / 2) * scaleX;
  const x = turret.position.x * scaleX;
  const y = turret.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(turret.angle);

  // Adjust the player ID based on the invertPlayerIds flag
  let turretPlayerId = turret.playerId;
  if (invertPlayerIds) {
    turretPlayerId = turret.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  if (turretPlayerId === playerNumber) {
    drawCtx.strokeStyle = "blue"; // Own turret
  } else {
    drawCtx.strokeStyle = "red"; // Opponent's turret
  }

  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.stroke();
  drawCtx.restore();
}

function fortressNoDrawZone() {
  noDrawZones = [];

  fortresses.forEach((fortress) => {
    const zone = createRectangularZone(
      fortress.position.x,
      fortress.position.y,
      fortress.width,
      fortress.height,
      gameWorldHeight * NO_DRAW_ZONE_PADDING_RATIO
    );

    noDrawZones.push(zone);
  });
}

function createRectangularZone(centerX, centerY, width, height, padding) {
  const halfWidth = width / 2 + padding;
  const halfHeight = height / 2 + padding;

  return [
    { x: centerX - halfWidth, y: centerY - halfHeight }, // Top-Left
    { x: centerX + halfWidth, y: centerY - halfHeight }, // Top-Right
    { x: centerX + halfWidth, y: centerY + halfHeight }, // Bottom-Right
    { x: centerX - halfWidth, y: centerY + halfHeight }, // Bottom-Left
  ];
}

function drawNoDrawZones() {
  drawCtx.strokeStyle = "rgba(255, 0, 0, 0.7)";
  drawCtx.lineWidth = 2;
  drawCtx.fillStyle = "rgba(255, 0, 0, 0.1)";

  noDrawZones.forEach((zone) => {
    drawCtx.beginPath();
    const transformedPoints = zone.map((point) => {
      return gameWorldToCanvas(point.x, point.y);
    });

    drawCtx.moveTo(transformedPoints[0].x, transformedPoints[0].y);
    for (let i = 1; i < transformedPoints.length; i++) {
      drawCtx.lineTo(transformedPoints[i].x, transformedPoints[i].y);
    }
    drawCtx.closePath();
    drawCtx.fill();
    drawCtx.stroke();

    // Draw the X inside the rectangle.
    drawCtx.beginPath();
    // Diagonal from Top-Left to Bottom-Right.
    drawCtx.moveTo(transformedPoints[0].x, transformedPoints[0].y);
    drawCtx.lineTo(transformedPoints[2].x, transformedPoints[2].y);
    // Diagonal from Top-Right to Bottom-Left.
    drawCtx.moveTo(transformedPoints[1].x, transformedPoints[1].y);
    drawCtx.lineTo(transformedPoints[3].x, transformedPoints[3].y);
    drawCtx.strokeStyle = "rgba(255, 0, 0, 0.7)";
    drawCtx.lineWidth = 2;
    drawCtx.stroke();
  });
}
