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

let shapeCountPlayer1 = 0;
let shapeCountPlayer2 = 0;
const maxShapesPerPlayer = 5;

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

let tanks = [];
let reactors = [];
let fortresses = [];
let turrets = [];
let shells = [];

let noDrawZones = [];

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

function render() {
  // Redraw the canvas
  redrawCanvas();

  // Continue the loop
  requestAnimationFrame(render);
}

socket.on("gameUpdate", (data) => {
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;
  shells = data.shells || [];

  fortressNoDrawZone();
});

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

socket.on("snapClose", (data) => {
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

socket.on("maxShapesReached", (data) => {
  disableDrawing();
});

// socket.on("finalizeDrawingPhase", () => {
//   currentGameState = GameState.GAME_RUNNING;
//   console.log("Drawing phase finalized. Game is now running.");
// });

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
  fortresses.forEach(drawFortress);
  reactors.forEach(drawReactor);
  turrets.forEach(drawTurret);
  tanks.forEach(drawTank);
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

  // Check if player has reached max shapes
  if (
    (playerNumber === PLAYER_ONE && shapeCountPlayer1 >= maxShapesPerPlayer) ||
    (playerNumber === PLAYER_TWO && shapeCountPlayer2 >= maxShapesPerPlayer)
  ) {
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
  snapCloseDrawing();
}

function handleTouchStart(evt) {
  if (currentGameState !== GameState.PRE_GAME && currentGameState !== GameState.GAME_RUNNING) {
    return;
  }

  // Check if player has reached max shapes
  if (
    (playerNumber === PLAYER_ONE && shapeCountPlayer1 >= maxShapesPerPlayer) ||
    (playerNumber === PLAYER_TWO && shapeCountPlayer2 >= maxShapesPerPlayer)
  ) {
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
  snapCloseDrawing();
}

function drawLine(fromCanvas, toCanvas, color, lineWidth) {
  drawCtx.beginPath();
  drawCtx.moveTo(fromCanvas.x, fromCanvas.y);
  drawCtx.lineTo(toCanvas.x, toCanvas.y);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = lineWidth;
  drawCtx.stroke();
  drawCtx.closePath();
}

function snapCloseDrawing() {
  if (!currentDrawingStart) {
    return;
  }

  const startX = currentDrawingStart.x;
  const startY = currentDrawingStart.y;

  const endX = lastX;
  const endY = lastY;

  drawLine({ x: endX, y: endY }, { x: startX, y: startY }, "#000000", 2);

  const gwFrom = canvasToGameWorld(endX, endY);
  const gwTo = canvasToGameWorld(startX, startY);

  drawingHistory.push({
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
    playerNumber: playerNumber,
  });

  socket.emit("snapClose", {
    from: gwFrom,
    to: gwTo,
    color: "#000000",
    lineWidth: 2,
  });

  if (playerNumber === PLAYER_ONE) {
    shapeCountPlayer1++;
    if (shapeCountPlayer1 >= maxShapesPerPlayer) {
      disableDrawing();
    }
  } else if (playerNumber === PLAYER_TWO) {
    shapeCountPlayer2++;
    if (shapeCountPlayer2 >= maxShapesPerPlayer) {
      disableDrawing();
    }
  }

  currentDrawingStart = null;

  drawDividingLine();
}

rulesButton.addEventListener("click", () => {
  rulesModal.style.display = "flex";
});

closeButton.addEventListener("click", () => {
  rulesModal.style.display = "none";
});

drawCanvas.addEventListener("mousedown", handleMouseDown, false);
drawCanvas.addEventListener("mousemove", handleMouseMove, false);
drawCanvas.addEventListener("mouseup", handleMouseUpOut, false);
drawCanvas.addEventListener("mouseout", handleMouseUpOut, false);

drawCanvas.addEventListener("touchstart", handleTouchStart, false);
drawCanvas.addEventListener("touchmove", handleTouchMove, false);
drawCanvas.addEventListener("touchend", handleTouchEndCancel, false);
drawCanvas.addEventListener("touchcancel", handleTouchEndCancel, false);

function disableDrawing() {
  drawCanvas.removeEventListener("mousedown", handleMouseDown, false);
  drawCanvas.removeEventListener("mousemove", handleMouseMove, false);
  drawCanvas.removeEventListener("mouseup", handleMouseUpOut, false);
  drawCanvas.removeEventListener("mouseout", handleMouseUpOut, false);

  drawCanvas.removeEventListener("touchstart", handleTouchStart, false);
  drawCanvas.removeEventListener("touchmove", handleTouchMove, false);
  drawCanvas.removeEventListener("touchend", handleTouchEndCancel, false);
  drawCanvas.removeEventListener("touchcancel", handleTouchEndCancel, false);
}

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

function drawTank(tank) {
  const size = tank.size;
  const x = tank.position.x * scaleX;
  const y = tank.position.y * scaleY;
  const scaledSize = size * scaleX;

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(tank.angle);

  if (tank.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (tank.playerId === PLAYER_TWO) {
    drawCtx.strokeStyle = "red";
  } else {
    drawCtx.strokeStyle = "black";
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-scaledSize / 2, -scaledSize / 2, scaledSize, scaledSize);
  drawCtx.restore();
}

function drawReactor(reactor) {
  const radius = (reactor.size / 2) * scaleX;
  const x = reactor.position.x * scaleX;
  const y = reactor.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);

  if (reactor.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (reactor.playerId === PLAYER_TWO) {
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
  drawCtx.rotate(fortress.angle);

  if (fortress.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (fortress.playerId === PLAYER_TWO) {
    drawCtx.strokeStyle = "red";
  } else {
    drawCtx.strokeStyle = "black";
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-width / 2, -height / 2, width, height);
  drawCtx.restore();
}

function drawTurret(turret) {
  const radius = (turret.size / 2) * scaleX;
  const x = turret.position.x * scaleX;
  const y = turret.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(turret.angle);

  if (turret.playerId === PLAYER_ONE) {
    drawCtx.strokeStyle = "blue";
  } else if (turret.playerId === PLAYER_TWO) {
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

function fortressNoDrawZone() {
  noDrawZones = [];

  fortresses.forEach((fortress) => {
    const zone = createRectangularZone(
      fortress.position.x,
      fortress.position.y,
      fortress.width,
      fortress.height,
      gameWorldHeight * 0.05
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
      const shouldTransform = false;
      return gameWorldToCanvas(point.x, point.y, shouldTransform);
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
