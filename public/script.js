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
const rulesButtons = document.querySelectorAll(".rulzButton");
const closeButton = document.querySelector(".close-button");
const rulesModal = document.getElementById("rulesModal");
const endDrawButton = document.getElementById("endDrawButton");
const timerElement = document.getElementById("Timer");

const drawCtx = drawCanvas.getContext("2d");

let lastX = 0;
let lastY = 0;
let dividingLine;
let totalPixelsDrawn = 0;
let currentDrawingSessionId = null;
let isDrawing = false;
let drawingEnabled = true;
let drawingHistory = { [PLAYER_ONE]: [], [PLAYER_TWO]: [] };
let currentDrawingStart = null;
let noDrawZones = [];
const NO_DRAW_ZONE_PADDING_RATIO = 0.05;

let tanks = [];
let reactors = [];
let fortresses = [];
let turrets = [];
let shells = [];

let isMouseDown = false;
let powerLevel = 0;
const maxPowerLevel = 100;
const maxPowerDuration = 500;
let powerInterval = null;
let isPowerLocked = false;

let powerStartTime = null;
let animationFrameId = null;

let actionMode = null;

let activeExplosions = [];

const EXPLOSION_BASE_SIZE = 500; // Base size in game world units

// Load explosion frames
const explosionFrames = Array.from({ length: 25 }, (_, i) => {
  const img = new Image();
  img.src = `assets/EXPLOSION/explosion4/${i + 1}.png`; // Adjust path as necessary
  return img;
});

// Wobble State Variables
let isWobbling = false;
let wobbleStartTime = 0;
let initialWobbleAngle = 0;
const wobbleFrequency = 60; // Adjust as needed for speed
const wobbleAmplitude = 0.1; // Maximum wobble angle in radians (~5.7 degrees)
let selectedUnit = null;

// Event Listeners
window.addEventListener("load", () => {
  updateButtonVisibility();
});
window.addEventListener("resize", resizeCanvas);

moveButton.addEventListener("click", () => {
  actionMode = "move";
});

shootButton.addEventListener("click", () => {
  actionMode = "shoot";
});

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
  updateButtonVisibility();
});

socket.on("preGame", () => {
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";
  socket.emit("ready");
});

socket.on("startPreGame", () => {
  currentGameState = GameState.PRE_GAME;
  updateButtonVisibility();
});

socket.on("initialGameState", (data) => {
  tanks = data.tanks;
  reactors = data.reactors;
  fortresses = data.fortresses;
  turrets = data.turrets;

  if (currentGameState === GameState.PRE_GAME) {
    fortressNoDrawZone();
  }

  if (!renderingStarted) {
    renderingStarted = true;
    requestAnimationFrame(render);
  }
});

socket.on("gameUpdate", (data) => {
  tanks = data.tanks.map((tank) => ({
    ...tank,
    hitPoints: tank.hitPoints, // Ensure hitPoints are present
    tracks: tank.tracks || [], // Initialize tracks if not present
  }));
  reactors = data.reactors.map((reactor) => ({
    ...reactor,
    hitPoints: reactor.hitPoints, // Ensure hitPoints are present
  }));
  fortresses = data.fortresses.map((fortress) => ({
    ...fortress,
  }));
  turrets = data.turrets.map((turret) => ({
    ...turret,
  }));
  shells = data.shells || [];

  if (currentGameState === GameState.PRE_GAME) {
    fortressNoDrawZone();
  }
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

  stopWobble();

  updateButtonVisibility();
});

socket.on("gameFull", () => {
  alert("The game is full.");
  joinButton.disabled = false;
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
  //NOTIFY PLAYER IN SOME WAY HERE OF DISABLED DRAWING
});

socket.on("gameRunning", (data) => {
  currentGameState = GameState.GAME_RUNNING;
  noDrawZones = [];
  drawingEnabled = false;
  redrawCanvas();
  updateButtonVisibility();
});

socket.on("validClick", () => {
  if (!isMouseDown) {
    isMouseDown = true; // Ensure the state is consistent
  }

  // Start increasing the power meter
  powerInterval = setInterval(increasePower, 1); // Increase power every 100 ms (adjust as needed)
});

socket.on("invalidClick", () => {
  // Click was not on a valid tank
  // alert("You must click on one of your tanks!");
});

socket.on("explosion", (data) => {
  const { x, y } = data;
  // Convert game world coordinates to canvas coordinates
  const canvasPos = gameWorldToCanvas(x, y);
  activeExplosions.push({
    x: canvasPos.x,
    y: canvasPos.y,
    frame: 0,
    timeoutId: null,
  });
});

// Client-side code

socket.on("updateHitPoints", (data) => {
  const { bodyId, hitPoints } = data;

  // Update hitPoints for tanks
  tanks = tanks.map((tank) => {
    if (tank.id === bodyId) {
      return { ...tank, hitPoints };
    }
    return tank;
  });

  // Update hitPoints for reactors
  reactors = reactors.map((reactor) => {
    if (reactor.id === bodyId) {
      return { ...reactor, hitPoints };
    }
    return reactor;
  });
});

// Client-side code

// Listen for tankDestroyed event
socket.on("tankDestroyed", (data) => {
  const { tankId, playerId } = data;

  // Remove the destroyed tank from the local state
  tanks = tanks.filter((tank) => tank.id !== tankId);

  // Optionally, display a destruction animation or sound
});

// Listen for reactorDestroyed event
socket.on("reactorDestroyed", (data) => {
  const { reactorId, playerId } = data;

  // Remove the destroyed reactor from the local state
  reactors = reactors.filter((reactor) => reactor.id !== reactorId);

  // Optionally, display a destruction animation or sound
});

// Client-side code

socket.on("gameOver", (data) => {
  const { winner, reason } = data;
  alert(`Player ${winner} wins! Reason: ${reason}`);

  // Optionally, reset the game state or redirect to a lobby
  location.reload(); // Simple way to restart the game
});

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

  // Draw fortresses, reactors, turrets
  fortresses.forEach((fortress) => drawFortress(fortress, invertPlayerIds));
  reactors.forEach((reactor) => drawReactor(reactor, invertPlayerIds));
  turrets.forEach((turret) => drawTurret(turret, invertPlayerIds));
  drawNoDrawZones();

  // **Draw tank tracks first (both rectangles and connecting lines)**
  tanks.forEach((tank) => {
    if (tank.tracks && Array.isArray(tank.tracks)) {
      tank.tracks.forEach((track) => {
        drawTankTrack(tank, track, invertPlayerIds);
      });

      // **Draw the gradient line from the latest track to the current position**
      drawTankCurrentLine(tank, invertPlayerIds);
    }
  });

  // Draw tanks
  tanks.forEach((tank) => drawTank(tank, invertPlayerIds));

  // Draw shells
  shells.forEach((shell) => drawShell(shell, invertPlayerIds));

  // Draw active explosions
  activeExplosions.forEach((explosion, index) => {
    if (explosion.frame < explosionFrames.length) {
      // Calculate explosion size based on scaling factors
      const explosionScale = (scaleX + scaleY) / 2; // Average scaling
      const explosionSize = EXPLOSION_BASE_SIZE * explosionScale;

      if (playerNumber === PLAYER_TWO) {
        // Draw rotated explosion to counteract canvas rotation
        drawImageRotated(
          drawCtx,
          explosionFrames[explosion.frame],
          explosion.x,
          explosion.y,
          explosionSize, // Scaled width
          explosionSize, // Scaled height
          Math.PI // Rotation in radians
        );
      } else {
        // Draw explosion normally
        drawImageRotated(
          drawCtx,
          explosionFrames[explosion.frame],
          explosion.x,
          explosion.y,
          explosionSize, // Scaled width
          explosionSize, // Scaled height
          0 // No rotation
        );
      }

      // Advance to the next frame
      explosion.frame += 1;
    } else {
      // Remove explosion from activeExplosions array
      activeExplosions.splice(index, 1);
    }
  });

  drawCtx.restore();
}

function resizeCanvas() {
  initializeCanvas();
}

function updateScalingFactors() {
  scaleX = drawCanvas.width / gameWorldWidth;
  scaleY = drawCanvas.height / gameWorldHeight;
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
  if (evt.button !== 0) {
    return;
  }

  switch (currentGameState) {
    case GameState.PRE_GAME:
      handleDrawingMouseDown(evt);
      break;
    case GameState.GAME_RUNNING:
      handleGameMouseDown(evt);
      break;
    default:
      console.log(`Unhandled game state: ${currentGameState}`);
  }
}

let color = null;
let drawingLegally = true;

socket.on("drawingIllegally", (data) => {
  drawingLegally = false;
  color = "#FF0000";
});

function handleDrawingMouseDown(evt) {
  if (evt.button !== 0 || !drawingEnabled) {
    return;
  }
  if (currentGameState !== GameState.PRE_GAME) {
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

function handleGameMouseDown(evt) {
  if (evt.button === 0) {
    // Left mouse button
    if (isPowerLocked) {
      // Power is locked; ignore this mousedown
      console.log("Power is locked. Ignoring mouseDown.");
      return;
    }

    if (isMouseDown) {
      // Mouse is already held down; prevent duplicate actions
      console.log("Mouse is already down. Ignoring duplicate mouseDown.");
      return;
    }

    isMouseDown = true; // Mark that the mouse is now held down

    const mousePos = getMousePos(evt);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    // Emit mouseDown event to the server
    socket.emit("mouseDown", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
      button: evt.button,
      actionMode: actionMode,
    });

    // Check if clicking on a player's own tank to start wobble
    const playerTanks = tanks.filter((tank) => tank.playerId === playerNumber);
    for (const tank of playerTanks) {
      const tankSize = tank.size;
      const dx = gameWorldPos.x - tank.position.x;
      const dy = gameWorldPos.y - tank.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= tankSize / 2) {
        selectedUnit = tank;
        startWobble();
        break;
      }
    }
  }
}

function handleMouseMove(evt) {
  // Determine the current game state and delegate accordingly
  switch (currentGameState) {
    case GameState.PRE_GAME:
      handleDrawingMouseMove(evt);
      break;
    case GameState.GAME_RUNNING:
      handleGameMouseMove(evt);
      break;
    default:
      // Optionally handle other game states or do nothing
      console.log(`Unhandled game state: ${currentGameState}`);
  }
}

function handleDrawingMouseMove(evt) {
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

function handleGameMouseMove(evt) {
  const mousePos = getMousePos(evt);
  const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

  if (isMouseDown) {
    socket.emit("mouseMove", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
    });
  }

  // Find if the mouse is over any of the player's own tanks
  const playerTanks = tanks.filter((tank) => tank.playerId === playerNumber);
  let unitUnderMouse = null;

  for (const tank of playerTanks) {
    const tankSize = tank.size;
    const dx = gameWorldPos.x - tank.position.x;
    const dy = gameWorldPos.y - tank.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= tankSize / 2) {
      unitUnderMouse = tank;
      break;
    }
  }

  if (unitUnderMouse && !isWobbling && !isMouseDown) {
    // Start wobble if hovering over a player's tank and not currently clicking
    selectedUnit = unitUnderMouse;
    startWobble();
  } else if ((!unitUnderMouse || playerNumber !== selectedUnit?.playerId) && isWobbling && !isMouseDown) {
    // Stop wobble if not hovering or hovering over opponent's tank
    stopWobble();
  }
}

function handleMouseUpOut(evt) {
  switch (currentGameState) {
    case GameState.PRE_GAME:
      handleDrawingMouseUpOut(evt);
      break;
    case GameState.GAME_RUNNING:
      handleGameMouseUpOut(evt);
      break;
    default:
      // Optionally handle other game states or do nothing
      console.log(`Unhandled game state: ${currentGameState}`);
  }
}

function handleDrawingMouseUpOut() {
  if (!isDrawing) {
    return;
  }
  isDrawing = false;

  // Notify the server that the drawing has ended
  socket.emit("endDrawing");
}

function handleGameMouseUpOut(evt) {
  if (isMouseDown) {
    isMouseDown = false; // Mouse is no longer held down

    const mousePos = getMousePos(evt);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    // Emit mouseUp event to the server
    socket.emit("mouseUp", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
      actionMode: actionMode,
    });

    // If power was locked, unlock it to allow new actions
    if (isPowerLocked) {
      isPowerLocked = false;
    }

    resetPower(); // Reset the power meter
    if (powerInterval) {
      clearInterval(powerInterval);
      powerInterval = null;
    }

    // Stop wobble after force is applied
    if (isWobbling) {
      stopWobble();
    }
  }
}

function handleContextMenu(evt) {
  // Reset power meter
  if (isMouseDown) {
    isMouseDown = false;
    resetPower();
    clearInterval(powerInterval);
    powerInterval = null;
  }
}

drawCanvas.addEventListener("mousedown", handleMouseDown, false);
drawCanvas.addEventListener("mousemove", handleMouseMove, false);
drawCanvas.addEventListener("mouseup", handleMouseUpOut, false);
drawCanvas.addEventListener("contextmenu", handleContextMenu, false);

function drawDividingLine() {
  drawCtx.beginPath();
  drawCtx.moveTo(0, dividingLine);
  drawCtx.lineTo(drawCanvas.width, dividingLine);
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.stroke();
  drawCtx.closePath();
}

function drawLine(fromCanvas, toCanvas, color = "#000000", lineWidth = 2) {
  drawCtx.beginPath();
  drawCtx.moveTo(fromCanvas.x, fromCanvas.y);
  drawCtx.lineTo(toCanvas.x, toCanvas.y);
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = lineWidth;
  drawCtx.stroke();
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

  let wobbleAngle = 0;
  if (isWobbling && selectedUnit && tank.id === selectedUnit.id) {
    const elapsedTime = Date.now() - wobbleStartTime;
    wobbleAngle = wobbleAmplitude * Math.cos(elapsedTime / wobbleFrequency);
  }

  drawCtx.save();
  drawCtx.translate(x, y);
  drawCtx.rotate(tank.angle + wobbleAngle); // Apply wobble to the rotation

  // Determine the tank's color based on hitPoints first
  if (tank.hitPoints < 2) {
    drawCtx.strokeStyle = "#FF4500"; // Critical hitpoints
  } else {
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
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-scaledSize / 2, -scaledSize / 2, scaledSize, scaledSize);

  // Current HP
  const hpColor = tank.hitPoints < 2 ? "#FF4500" : "#FF4500";
  drawCtx.fillStyle = hpColor;

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
    drawCtx.strokeStyle = "blue";
  } else {
    drawCtx.strokeStyle = "red";
  }

  drawCtx.lineWidth = 2;
  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.stroke();
  drawCtx.restore();
}

function drawShell(shell, invertPlayerIds) {
  if (!shell.size || shell.size <= 0) {
    return;
  }
  const radius = shell.size * scaleX;
  const x = shell.position.x * scaleX;
  const y = shell.position.y * scaleY;

  drawCtx.save();
  drawCtx.translate(x, y);

  let shellPlayerId = shell.playerId;
  if (invertPlayerIds) {
    shellPlayerId = shell.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  drawCtx.fillStyle = shellPlayerId === playerNumber ? "blue" : "red";

  drawCtx.beginPath();
  drawCtx.arc(0, 0, radius, 0, 2 * Math.PI);
  drawCtx.fill();
  drawCtx.restore();
}

function fortressNoDrawZone() {
  if (currentGameState !== GameState.PRE_GAME) {
    return;
  }

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

function increasePower() {
  if (powerLevel >= maxPowerLevel) {
    powerLevel = maxPowerLevel;
    clearInterval(powerInterval); // Stop increasing power
    powerInterval = null;
  } else {
    powerLevel += 1; // Adjust increment as needed
  }
  powerMeterFill.style.height = `${powerLevel}%`;
}

function resetPower() {
  powerLevel = 0;
  powerMeterFill.style.height = "0%";
}

function drawImageRotated(ctx, img, x, y, width, height, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(img, -width / 2, -height / 2, width, height);
  ctx.restore();
}

function startWobble() {
  if (!isWobbling && selectedUnit && selectedUnit.label === "Tank") {
    isWobbling = true;
    wobbleStartTime = Date.now();
    initialWobbleAngle = selectedUnit.angle || 0;
  }
}

function stopWobble() {
  if (isWobbling) {
    isWobbling = false;
    selectedUnit = null;
  }
}

function drawTankTrack(tank, track, invertPlayerIds) {
  // Extract necessary properties
  const size = tank.size;
  const x = track.position.x * scaleX;
  const y = track.position.y * scaleY;
  const scaledSize = size * scaleX;
  const trackAngle = track.angle; // Use track angle if available

  // Determine the color based on player ownership
  let tankPlayerId = tank.playerId;
  if (invertPlayerIds) {
    tankPlayerId = tank.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  const color =
    tankPlayerId === playerNumber
      ? `rgba(0, 0, 255, ${track.opacity})` // Own tank tracks
      : `rgba(255, 0, 0, ${track.opacity})`; // Opponent's tank tracks

  drawCtx.save(); // Save the current state
  drawCtx.translate(x, y); // Move to the track's position
  drawCtx.rotate(trackAngle); // Rotate the context to the track's angle

  // Draw the rotated rectangle representing the track
  drawCtx.strokeStyle = color;
  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-scaledSize / 2, -scaledSize / 2, scaledSize, scaledSize);

  drawCtx.restore(); // Restore the state to avoid affecting other drawings

  // Draw line to the next track point, if exists
  const trackIndex = tank.tracks.indexOf(track);
  if (trackIndex < tank.tracks.length - 1) {
    const nextTrack = tank.tracks[trackIndex + 1];
    if (nextTrack) {
      const nextX = nextTrack.position.x * scaleX;
      const nextY = nextTrack.position.y * scaleY;

      // Create a gradient from current track to next track
      const gradient = drawCtx.createLinearGradient(x, y, nextX, nextY);
      gradient.addColorStop(
        0,
        tankPlayerId === playerNumber ? `rgba(0, 0, 255, ${track.opacity})` : `rgba(255, 0, 0, ${track.opacity})`
      );
      gradient.addColorStop(
        1,
        tankPlayerId === playerNumber
          ? `rgba(0, 0, 255, ${nextTrack.opacity})`
          : `rgba(255, 0, 0, ${nextTrack.opacity})`
      );

      drawCtx.strokeStyle = gradient;
      drawCtx.lineWidth = 2 * scaleX; // Adjust line width based on scaling
      drawCtx.beginPath();
      drawCtx.moveTo(x, y);
      drawCtx.lineTo(nextX, nextY);
      drawCtx.stroke();
    }
  }
}

function drawTankCurrentLine(tank, invertPlayerIds) {
  if (!tank.tracks || tank.tracks.length === 0) {
    return; // No tracks to connect
  }

  // Get the most recent track point (first element in the tracks array)
  const latestTrack = tank.tracks[0];
  const trackX = latestTrack.position.x * scaleX;
  const trackY = latestTrack.position.y * scaleY;

  // Current tank position
  const tankX = tank.position.x * scaleX;
  const tankY = tank.position.y * scaleY;

  // Determine the color based on player ownership
  let tankPlayerId = tank.playerId;
  if (invertPlayerIds) {
    tankPlayerId = tank.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  // Create a gradient from the latest track to the current position
  const gradient = drawCtx.createLinearGradient(trackX, trackY, tankX, tankY);
  gradient.addColorStop(
    0,
    tankPlayerId === playerNumber
      ? `rgba(0, 0, 255, ${latestTrack.opacity})`
      : `rgba(255, 0, 0, ${latestTrack.opacity})`
  );
  gradient.addColorStop(1, tankPlayerId === playerNumber ? `rgba(0, 0, 255, 0)` : `rgba(255, 0, 0, 0)`); // Fade out to transparent

  drawCtx.strokeStyle = gradient;
  drawCtx.lineWidth = 2 * scaleX; // Adjust line width based on scaling
  drawCtx.lineCap = "round";

  // Draw the gradient line
  drawCtx.beginPath();
  drawCtx.moveTo(trackX, trackY);
  drawCtx.lineTo(tankX, tankY);
  drawCtx.stroke();
}

socket.on("powerCapped", (data) => {
  console.log(`Power was automatically capped after ${data.duration} ms.`);
  // alert("Power level has been automatically capped at 1.2 seconds.");
  resetPower(); // Reset the power meter

  isPowerLocked = false; // Lock the power meter to prevent further increases
  if (powerInterval) {
    clearInterval(powerInterval); // Stop increasing power
    powerInterval = null;
  }
  isMouseDown = false; // Ensure the client recognizes that the mouse is no longer effectively held down
});

function updateButtonVisibility() {
  if (currentGameState === GameState.PRE_GAME) {
    // Hide "Move" and "Shoot" buttons
    moveButton.style.display = "none";
    shootButton.style.display = "none";

    // Show "End Draw" and "Erase Previous Drawing" buttons
    endDrawButton.style.display = "block";
    removeDrawingButton.style.display = "block";
  } else if (currentGameState === GameState.GAME_RUNNING) {
    // Show "Move" and "Shoot" buttons
    moveButton.style.display = "block";
    shootButton.style.display = "block";

    // Hide "End Draw" and "Erase Previous Drawing" buttons
    endDrawButton.style.display = "none";
    removeDrawingButton.style.display = "none";
  } else {
    // For other states (e.g., LOBBY, POST_GAME), hide all action buttons
    moveButton.style.display = "none";
    shootButton.style.display = "none";
    endDrawButton.style.display = "none";
    removeDrawingButton.style.display = "none";
  }
}

// Function to open the modal
const openModal = () => {
  rulesModal.style.display = "block";
};

// Function to close the modal
const closeModal = () => {
  rulesModal.style.display = "none";
};

// Event listener for the Rulz button to open the modal
rulesButtons.forEach((button) => {
  button.addEventListener("click", openModal);
});

// Event listener for the Close button to close the modal
closeButton.addEventListener("click", closeModal);

// Event listener for clicks outside the modal content to close the modal
window.addEventListener("click", (event) => {
  if (event.target === rulesModal) {
    closeModal();
  }
});

// Optional: Close the modal when the 'Escape' key is pressed
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});
