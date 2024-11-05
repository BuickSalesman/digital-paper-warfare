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
const rulesButton = document.getElementById("rulzButton");
const closeButton = document.querySelector(".close-button");
const rulesModal = document.getElementById("rulesModal");
const endDrawButton = document.getElementById("endDrawButton");
const timerElement = document.getElementById("Timer");

const drawCtx = drawCanvas.getContext("2d");

let dividingLine;
let lastX = 0;
let lastY = 0;

let tanks = [];
let reactors = [];
let fortresses = [];
let turrets = [];
let shells = [];

let isMouseDown = false;
let powerLevel = 0;
const maxPowerLevel = 100;
let powerInterval = null;

let actionMode = null;

// Event Listeners
window.addEventListener("load", () => {});
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

  // Clear the canvas
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Reset game entities
  tanks = [];
  reactors = [];
  fortresses = [];
  turrets = [];
  shells = [];
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

socket.on("validClick", () => {
  isMouseDown = true;

  // Start increasing the power meter
  powerInterval = setInterval(increasePower, 1.2); // Adjust interval as needed
});

socket.on("invalidClick", () => {
  // Click was not on a valid tank
  // alert("You must click on one of your tanks!");
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

  drawDividingLine();
  fortresses.forEach((fortress) => drawFortress(fortress, invertPlayerIds));
  reactors.forEach((reactor) => drawReactor(reactor, invertPlayerIds));
  turrets.forEach((turret) => drawTurret(turret, invertPlayerIds));
  tanks.forEach((tank) => drawTank(tank, invertPlayerIds));
  shells.forEach((shell) => drawShell(shell, invertPlayerIds));

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
  // Only proceed if the left mouse button is pressed
  if (evt.button === 0) {
    const mousePos = getMousePos(evt);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    socket.emit("mouseDown", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
      button: evt.button,
      actionMode: actionMode,
    });
  }
}

let color = null;
let drawingLegally = true;

socket.on("drawingIllegally", (data) => {
  drawingLegally = false;
  color = "#FF0000";
});

function handleMouseMove(evt) {
  return;
}

function handleMouseUpOut(evt) {
  if (isMouseDown) {
    isMouseDown = false;

    const mousePos = getMousePos(evt);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    socket.emit("mouseUp", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
      actionMode: actionMode,
    });

    resetPower();
    clearInterval(powerInterval);
    powerInterval = null;
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
drawCanvas.addEventListener("mouseout", handleMouseUpOut, false);
drawCanvas.addEventListener("mouseleave", handleMouseUpOut, false);
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

function drawShell(shell, invertPlayerIds) {
  if (!shell.size || shell.size <= 0) {
    return;
  }
  const radius = shell.size * scaleX;
  const x = shell.position.x * scaleX;
  const y = shell.position.y * scaleY;

  // Optional: Log shell rendering details
  console.log(`Drawing shell ID: ${shell.id} at (${x}, ${y}) with radius: ${radius}`);

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

function increasePower() {
  if (powerLevel >= maxPowerLevel) {
    powerLevel = maxPowerLevel;
  } else {
    powerLevel += 1; // Adjust increment as needed
  }
  powerMeterFill.style.height = `${powerLevel}%`;
}

function resetPower() {
  powerLevel = 0;
  powerMeterFill.style.height = "0%";
}
