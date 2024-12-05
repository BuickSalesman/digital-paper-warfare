/* global io */
const socket = io();

// Used to determine the player number of the local client. Set to null until data is rec'd from server. Reset on disconnection.
let localPlayerNumber = null;

// Used to determine what room the local and opponent client are in. Set to null until data rec'd from server. Set back to null on disconnection.

// Flag to determine when the rendering loop should be called. Does not start until both players are out of the landing page. Reset on player disconnection.
let renderingStarted = false;

// Initialize height and width for the drawing canvas (game world). Set to null until window size gives a relative value for these fields. Initial data rec'd from server. Used to determine aspect ratio of battlefield, fortres no drawing zones, and scaling factors. Reset on disconnection.
let gameWorldHeight = null;
let gameWorldWidth = null;

// Initialize scaling factors. Used in coordinate conversion, maintaining aspect ratio, and allows game to be responsive to different screen sizes and resolutions. Also used in game object rendering and animations. Helps convert pixel values into game world coords. Setting the value of these scaling factors to 1 initially ensures coordinatetransformations behave predictably.
let scaleX = 1;
let scaleY = 1;

let lastMouseEvent = null;

//NEED TO DELETE AND REFACTOR THIS AND VALIDATE EVERY GAME STATE AND GAME STATE RELATED LOGIC ON THE SERVER SIDE.
const GameState = {
  LOBBY: "LOBBY",
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
};

let currentGameState = GameState.LOBBY;

let width = 1885; // Placeholder, will be updated
let height = 1414; // Placeholder, will be updated

// Used for comparisons between player ID's throughout the code. Differs from playerNumber as they are constant. May be useful to refactor into a deconstructed variable, but will require changing all of the code where these variables are called.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

// Grabbing HTML elements for JS interactivity.
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
const landingRulesButton = document.getElementById("landingRulzButton");
const closeButton = document.querySelector(".close-button");
const rulesModal = document.getElementById("rulesModal");
const endDrawButton = document.getElementById("endDrawButton");
const timerElement = document.getElementById("Timer");
const messageField = document.getElementById("messageField");
const drawCtx = drawCanvas.getContext("2d");

// Used to track the previous-most x,y coords of the mouse during drawing events
let lastX = null;
let lastY = null;

// Used to determine whether or not the local player is within their legal side of the battlefield during drawing events. Defined in initializeCanvas().
let dividingLine;

// Acts as a unique identifier for the current local individual shape drawing session. Set to null initially and assigned a unique string when a drawing session begins. Essential for managing drawing history and synchronizing drawing data with the server. Assigned unique string in handleDrawingMouseDown().
let currentDrawingSessionId = null;

// Client side boolean flag that represents if a user is currently enaged in a drawing session. Poses security risks, need more robust validation of this flag in the server side. Could lead to inconsistent state management.
let isDrawing = false;

// Flag to indicate whether the local player is allowed to draw on the game canvas. Needs robust server side validation to prevent drawing when it should be disabled.
let drawingEnabled = true;

// Initialize empty array for the drawing history of both players locally, since both players shapes should be rendered  locally, for both players. Data for both rec'd from server. Used whenever the canvas needs to be redrawn, or when drawings need to be added or deleted form the game. This could potentially be a security issue and may require additional validation on the client side, as currently there is none.
let drawingHistory = { [PLAYER_ONE]: [], [PLAYER_TWO]: [] };

// Initialize empty array for no draw zones. Used to restrict drawing around fortresses. Scalable with game world to ensure consistent ratios of restriced areas to game world. Reset on disconnect, cleared on end of drawing phase. May need additional management on server, or be exclusive to the server, to prevent malicious clients from changing thr available drawing zones.
let noDrawZones = [];

// Defines the ratio of padding relative to the game world height to ensure consistent scaling and size.
const NO_DRAW_ZONE_PADDING_RATIO = 0.05;

// Initialize empty arrays for game bodies, facilitating organized management and interaction. These arrays are populated with data rec'd directly from the server, so should be fairly safe from malicious clients. Need to consider if the data in these arrays can be maniuplated after the fact. Reset on disconnection.
let tanks = [];
let reactors = [];
let fortresses = [];
let turrets = [];

let powerLevel = 0;
let powerIncrementInterval = null;
let isPowerIncrementing = false;

// This array is slightly different as only one shell should be able to exist in the game world at a time. Exists solely to manage creation and deletion of the single shell.
let shells = [];

// Boolean to track whether or not the mouse is currently pressed. Initialized to false as the mouse is initially not pressed. Used in virtually every aspect of the game. May need a sister state to track mouse state on server to prevent unitended and malcious actions. ChatGPT suggested throttling mouse events?
let isMouseDown = false;

// initialize variable to represent the current action mode of the local client. String of either "move", or "shoot". Might not want to initialize as null, as I keep forgetting that this means you HAVE to click and action button before taking any action. May want to implement validation on server tied to the button clicks.
let actionMode = "move";

// Array of active explosions on the canvas. No security risks.
let activeExplosions = [];

// Array to track active smoke animations
let activeSmokeAnimations = [];

const SMOKE_ANIMATION_FRAME_DURATION = 100; // Duration of each frame in milliseconds
const SMOKE_ANIMATION_BASE_SIZE = 100; // Base size in game world units

const EXPLOSION_BASE_SIZE = 500; // Base size in game world units

// Load explosion frames
const explosionFrames = Array.from({ length: 25 }, (_, i) => {
  const img = new Image();
  img.src = `assets/EXPLOSION/explosion4/${i + 1}.png`; // Adjust path as necessary
  return img;
});

// Load smoke animation frames
const smokeFrames = Array.from({ length: 8 }, (_, i) => {
  const img = new Image();
  img.src = `assets/smoke/smoke${i + 1}.png`; // Ensure the path is correct
  return img;
});

// Wobble State Variables. No security risks.
let isWobbling = false;
let wobbleStartTime = 0;
let initialWobbleAngle = 0;
const wobbleFrequency = 60; // Adjust as needed for speed
const wobbleAmplitude = 0.1; // Maximum wobble angle in radians (~5.7 degrees)
let selectedUnit = null;

// Event Listeners
// Adds event listener to local client window for loading.
window.addEventListener("load", () => {
  // Checks to see which buttons should be visible based on game state.
  updateButtonVisibility();
});

// Adds event listener to the local client window for actions on resize. Calls initiaze canvas.
window.addEventListener("resize", initializeCanvas);

// Function to open the modal.
const openModal = () => {
  rulesModal.style.display = "block";
};

// Function to close the modal.
const closeModal = () => {
  rulesModal.style.display = "none";
};

// Event listerner for click on the move button. This changes the action state to move. Refactor to send the click to the server side for validation and action state change.
moveButton.addEventListener("click", () => {
  actionMode = "move";
  updateActionModeIndicator();
});

// Event listener for click on the shoot button. This changes the action state to shoot. Refactor to send the click to the server side for validation and action state change.
shootButton.addEventListener("click", () => {
  actionMode = "shoot";
  updateActionModeIndicator();
});

// Prevents right clicks on the draw canvas, which can have unitended effects during drawing or move/shoot actions. To fix, obfuscate this code so that it is difficult to interact with on the client side, and reject all right clicks incoming to the server side, on the server side.
drawCanvas.addEventListener(
  "contextmenu",
  function (e) {
    e.preventDefault();
  },
  false
);

// Event listener for the Rulz button to open the modal.
rulesButton.addEventListener("click", openModal);

landingRulesButton.addEventListener("click", openModal);

// Event listener for the Close button to close the modal.
closeButton.addEventListener("click", closeModal);

// Event listener for clicks outside the modal content to close the modal.
window.addEventListener("click", (event) => {
  if (event.target === rulesModal) {
    closeModal();
  }
});

// Close the modal when the 'Escape' key is pressed.
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

// On click, send request to server to join next available room.
joinButton.addEventListener("click", () => {
  const passcode = passcodeInput.value.trim().toUpperCase();
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

  joinButton.classList.add("pressed");

  // Since the disabled button and input field are malleble through dev tools, make sure to ignore extra button presses server side.
  joinButton.disabled = true;
  passcodeInput.disabled = true;

  statusText.textContent = "Waiting for other player...";

  // Prime example of something that shouldn't exist on the server, validate entirely on server.
  currentGameState = GameState.LOBBY;
});

removeDrawingButton.addEventListener("click", () => {
  // Emit an event to the server to erase the last drawing
  socket.emit("eraseLastDrawing");
});

endDrawButton.addEventListener("click", () => {
  // Send 'endDrawingPhase' event to the server
  socket.emit("endDrawingPhase");

  // Disable drawing locally. This needs to be enforced on the server.
  drawingEnabled = true;

  // Disable the erasePreviousDrawingButton. Since the disabled button and input field are malleble through dev tools, make sure to ignore extra button presses server side.
  removeDrawingButton.disabled = true;

  // Disable the endDrawButton. Since the disabled button and input field are malleble through dev tools, make sure to ignore extra button presses server side.
  endDrawButton.disabled = true;
});

// Add pointer event listeners to the canvas.
drawCanvas.addEventListener("pointerdown", handlePointerDown, false);
drawCanvas.addEventListener("pointermove", handlePointerMove, false);
drawCanvas.addEventListener("pointerup", handlePointerUp, false);
drawCanvas.addEventListener("pointercancel", handlePointerCancel, false);

// Add mouse event listeners to the canvas.
drawCanvas.addEventListener("mousedown", handleMouseDown, false);
drawCanvas.addEventListener("mousemove", handleMouseMove, false);
drawCanvas.addEventListener("mouseup", handleMouseUpOut, false);

// Socket Events - all data sent to and rec'd from the server is handled here.
// Recieves player info from server side. Uses this data to initialize the canvas, and update button visibility.
socket.on("playerInfo", (data) => {
  localPlayerNumber = data.localPlayerNumber;
  gameWorldWidth = data.gameWorldWidth;
  gameWorldHeight = data.gameWorldHeight;

  initializeCanvas();
  // May want to move into preGame event handler and use GameState from server for the conditional checks here.
  updateButtonVisibility();
});

socket.on("bothPlayersJoinedRoom", () => {
  landingPage.style.display = "none";
  gameAndPowerContainer.style.display = "flex";
  socket.emit("ready");
});

socket.on("startPreGame", () => {
  // Definitely need to remove the state changes here and handle on the server.
  currentGameState = GameState.PRE_GAME;

  // It also seems like this can be moved somehwere else. ChatGPT says that it
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
    isSmoking: false,
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

socket.on("playerDisconnected", (localPlayerNumber) => {
  window.location.reload();
});

socket.on("gameFull", () => {
  alert("The game is full.");
  joinButton.disabled = false;
});

socket.on("drawingMirror", (data) => {
  const { localPlayerNumber: senderPlayer, from, to, color = "#000000", lineWidth = 2, drawingSessionId } = data;

  // Add to the appropriate player's history
  drawingHistory[senderPlayer] = drawingHistory[senderPlayer] || [];
  drawingHistory[senderPlayer].push({
    from,
    to,
    color,
    lineWidth,
    localPlayerNumber: senderPlayer,
    drawingSessionId: drawingSessionId,
  });

  const canvasFrom = gameWorldToCanvas(from.x, from.y);
  const canvasTo = gameWorldToCanvas(to.x, to.y);

  drawLine(canvasFrom, canvasTo, color, lineWidth);
  drawDividingLine();
});

socket.on("shapeClosed", (data) => {
  const { localPlayerNumber: senderPlayer, closingLine, drawingSessionId } = data;

  // Add the closing line to the correct player's history
  drawingHistory[senderPlayer].push({
    from: closingLine.from,
    to: closingLine.to,
    color: closingLine.color,
    lineWidth: closingLine.lineWidth,
    localPlayerNumber: senderPlayer,
    drawingSessionId: drawingSessionId,
  });

  // Draw the closing line
  const canvasFrom = gameWorldToCanvas(closingLine.from.x, closingLine.from.y);
  const canvasTo = gameWorldToCanvas(closingLine.to.x, closingLine.to.y);

  drawLine(canvasFrom, canvasTo, closingLine.color, closingLine.lineWidth);
  drawDividingLine();
});

socket.on("eraseDrawingSession", (data) => {
  const { drawingSessionId, localPlayerNumber: senderPlayer } = data;

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

  // Update drawingHistory to set full opacity
  for (let player of [PLAYER_ONE, PLAYER_TWO]) {
    if (drawingHistory[player]) {
      drawingHistory[player] = drawingHistory[player].map((segment) => {
        // Clone the segment
        const newSegment = { ...segment };
        // Set color to full opacity
        if (segment.color) {
          newSegment.color = setColorFullOpacity(segment.color);
        }
        return newSegment;
      });
    }
  }

  redrawCanvas();
  updateButtonVisibility();
});

let selectedUnitId = null;

socket.on("validClick", (data) => {
  isMouseDown = true;
  startPowerIncrement();
  selectedUnitId = data.unitId;
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

  // Clear the timer display
  const timerElement = document.getElementById("Timer");
  timerElement.textContent = "";

  // Optionally, reset the game state or redirect to a lobby
  location.reload(); // Simple way to restart the game
});

function redrawCanvas() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  drawCtx.save();
  let invertPlayerIds = false;
  if (localPlayerNumber === PLAYER_TWO) {
    // Rotate the canvas by 180 degrees around its center
    drawCtx.translate(drawCanvas.width / 2, drawCanvas.height / 2);
    drawCtx.rotate(Math.PI);
    drawCtx.translate(-drawCanvas.width / 2, -drawCanvas.height / 2);
    invertPlayerIds = true;
  }

  // Draw the opponent's drawings
  const opponentPlayerNumber = localPlayerNumber === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;

  drawingHistory[opponentPlayerNumber].forEach((path) => {
    const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y);
    const canvasTo = gameWorldToCanvas(path.to.x, path.to.y);

    drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
  });

  // Draw the local player's drawings
  if (drawingHistory[localPlayerNumber]) {
    drawingHistory[localPlayerNumber].forEach((path) => {
      const canvasFrom = gameWorldToCanvas(path.from.x, path.from.y);
      const canvasTo = gameWorldToCanvas(path.to.x, path.to.y);

      drawLine(canvasFrom, canvasTo, path.color, path.lineWidth);
    });
  }

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

      if (localPlayerNumber === PLAYER_TWO) {
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

  // Draw active smoke animations
  const currentTime = Date.now();

  activeSmokeAnimations.forEach((animation, index) => {
    const elapsed = currentTime - animation.lastFrameTime;

    if (elapsed >= SMOKE_ANIMATION_FRAME_DURATION) {
      animation.frameIndex = (animation.frameIndex + 1) % smokeFrames.length;
      animation.lastFrameTime = currentTime;
    }

    // Retrieve the current tank's position
    const tank = tanks.find((t) => t.id === animation.tankId);
    if (!tank) {
      // If the tank no longer exists (destroyed), remove the animation
      activeSmokeAnimations.splice(index, 1);
      return;
    }

    const gwX = tank.position.x;
    const gwY = tank.position.y;
    const canvasPos = gameWorldToCanvas(gwX, gwY);
    const scale = (scaleX + scaleY) / 2;
    const size = SMOKE_ANIMATION_BASE_SIZE * scale;

    // Do not adjust positions for PLAYER_TWO
    const drawX = canvasPos.x;
    const drawY = canvasPos.y;

    // Adjust rotation for PLAYER_TWO
    const rotation = localPlayerNumber === PLAYER_TWO ? Math.PI : 0;

    // Draw the current smoke frame
    const frame = smokeFrames[animation.frameIndex];
    drawImageRotated(
      drawCtx,
      frame,
      drawX,
      drawY,
      size, // Scaled width
      size, // Scaled height
      rotation // Rotation in radians
    );
  });

  drawCtx.restore();
}

// Tablet detection
function isTabletDevice() {
  const ua = navigator.userAgent.toLowerCase();

  // iPad detection for iPadOS 13+
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return true;
  }

  // iPad detection for older versions
  if (ua.includes("ipad")) {
    return true;
  }

  // Android tablet detection
  if (ua.includes("android") && !ua.includes("mobile")) {
    return true;
  }

  // Other tablet detection
  if (ua.includes("tablet") || ua.includes("kindle") || ua.includes("silk") || ua.includes("playbook")) {
    return true;
  }

  return false;
}

if (isTabletDevice()) {
  document.body.classList.add("tablet");
}

function initializeCanvas() {
  if (!gameWorldWidth || !gameWorldHeight) {
    console.error("Game world dimensions are not set.");
    return;
  }

  const aspectRatio = gameWorldWidth / gameWorldHeight;
  const isTablet = document.body.classList.contains("tablet");

  // Common scaling factors
  let widthScaleFactor = 0.9;
  let maxCanvasWidth = 800;

  if (isTablet) {
    // Adjust scaling factors specifically for tablets
    widthScaleFactor *= 1.0; // You can adjust this value
    maxCanvasWidth = window.innerWidth * 0.95;
  } else {
    // Adjust scaling factors specifically for desktops
    widthScaleFactor *= 1.2; // Increase by 20%
    maxCanvasWidth *= 1.2; // Increase by 20%
  }

  let canvasWidth = Math.min(window.innerWidth * widthScaleFactor, maxCanvasWidth);
  let canvasHeight = canvasWidth / aspectRatio;

  // Limit canvas height to prevent overflow
  const maxCanvasHeight = isTablet ? window.innerHeight * 0.8 : window.innerHeight * 0.96;
  if (canvasHeight > maxCanvasHeight) {
    canvasHeight = maxCanvasHeight;
    canvasWidth = canvasHeight * aspectRatio;
  }

  gameContainer.style.width = `${canvasWidth}px`;
  gameContainer.style.height = `${canvasHeight}px`;

  drawCanvas.width = canvasWidth;
  drawCanvas.height = canvasHeight;

  document.documentElement.style.setProperty("--canvas-width-px", `${canvasWidth}px`);
  document.documentElement.style.setProperty("--canvas-height-px", `${canvasHeight}px`);

  width = canvasWidth;
  height = canvasHeight;

  dividingLine = drawCanvas.height / 2;

  updateScalingFactors();
  redrawCanvas();
  drawDividingLine();
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

  if (localPlayerNumber === PLAYER_TWO) {
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

  currentDrawingSessionId = `${localPlayerNumber}-${Date.now()}-${Math.random()}`;

  const gwPos = canvasToGameWorld(pos.x, pos.y);
  socket.emit("startDrawing", { position: gwPos, drawingSessionId: currentDrawingSessionId });
}

let mouseDownTime = 0;
let startPosition = null;

function handleGameMouseDown(evt) {
  if (evt.button === 0) {
    // Mouse is already held down; prevent duplicate actions

    lastMouseEvent = evt;

    const mousePos = getMousePos(evt);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    mouseDownTime = Date.now();
    startPosition = { x: gameWorldPos.x, y: gameWorldPos.y };

    // Emit mouseDown event to the server
    socket.emit("mouseDown", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
      button: evt.button,
      actionMode: actionMode,
    });

    // Check if clicking on a player's own tank to start wobble
    const playerTanks = tanks.filter((tank) => tank.playerId === localPlayerNumber);
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

  // Send drawing data to server
  socket.emit("drawing", {
    drawingSessionId: currentDrawingSessionId,
    from: gwFrom,
    to: gwTo,
    // color: drawColor,
    lineWidth: 2,
  });

  lastX = currentX;
  lastY = currentY;
}

function handleGameMouseMove(evt) {
  const mousePos = getMousePos(evt);
  const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

  if (isMouseDown) {
    lastMouseEvent = evt;

    socket.emit("mouseMove", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
    });
  }

  // Find if the mouse is over any of the player's own tanks
  const playerTanks = tanks.filter((tank) => tank.playerId === localPlayerNumber);
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
  } else if ((!unitUnderMouse || localPlayerNumber !== selectedUnit?.playerId) && isWobbling && !isMouseDown) {
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

function handleGameMouseUpOut(evt, forced = false) {
  if (isMouseDown) {
    const mousePos = getMousePos(evt || lastMouseEvent);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    // Calculate powerLevel
    const elapsedTime = Date.now() - mouseDownTime;
    const powerDuration = 650; // Duration to reach 100%
    let powerLevel = (elapsedTime / powerDuration) * 100;
    powerLevel = Math.min(powerLevel, 100);

    forced = powerLevel >= 100;

    // Emit mouseUp event to the server
    socket.emit("mouseUp", {
      startX: startPosition.x,
      startY: startPosition.y,
      endX: gameWorldPos.x,
      endY: gameWorldPos.y,
      actionMode: actionMode,
      powerLevel: powerLevel,
      forced: forced,
      unitId: selectedUnitId, // Include the unitId
    });

    stopPowerIncrement();

    // Stop wobble after force is applied
    if (isWobbling) {
      stopWobble();
    }

    isMouseDown = false; // Mouse is no longer held down
    startPosition = null;
    selectedUnitId = null; // Reset after action
  }
}

// Pointer Event Handlers

function handlePointerDown(evt) {
  evt.preventDefault(); // Prevent default actions like scrolling
  if (evt.pointerType === "touch" || evt.pointerType === "pen" || evt.pointerType === "mouse") {
    handleMouseDown(evt);
  }
}

function handlePointerMove(evt) {
  evt.preventDefault();
  if (evt.pointerType === "touch" || evt.pointerType === "pen" || evt.pointerType === "mouse") {
    handleMouseMove(evt);
  }
}

function handlePointerUp(evt) {
  evt.preventDefault();
  if (evt.pointerType === "touch" || evt.pointerType === "pen" || evt.pointerType === "mouse") {
    handleMouseUpOut(evt);
  }
}

function handlePointerCancel(evt) {
  evt.preventDefault();
  if (evt.pointerType === "touch" || evt.pointerType === "pen" || evt.pointerType === "mouse") {
    handleMouseUpOut(evt);
  }
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

function drawLine(fromCanvas, toCanvas, color = "#000000", lineWidth = 2) {
  drawCtx.beginPath();
  drawCtx.moveTo(fromCanvas.x, fromCanvas.y);
  drawCtx.lineTo(toCanvas.x, toCanvas.y);
  drawCtx.strokeStyle = color; // Can be an RGBA string
  drawCtx.lineWidth = lineWidth;
  drawCtx.stroke();
}

function isWithinPlayerArea(y) {
  if (localPlayerNumber === PLAYER_TWO) {
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
  let tankPlayerId = tank.playerId;
  if (invertPlayerIds) {
    tankPlayerId = tank.playerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  }

  if (tankPlayerId === localPlayerNumber) {
    drawCtx.strokeStyle = "blue"; // Own tank
  } else {
    drawCtx.strokeStyle = "red"; // Opponent's tank
  }

  drawCtx.lineWidth = 2;
  drawCtx.strokeRect(-scaledSize / 2, -scaledSize / 2, scaledSize, scaledSize);

  drawCtx.restore();

  // Handle smoke animation without relying on tank.isSmoking
  if (tank.hitPoints < 2) {
    // Check if an animation for this tank already exists
    const existingAnimation = activeSmokeAnimations.find((anim) => anim.tankId === tank.id);

    if (!existingAnimation) {
      // Add new smoke animation for this tank
      activeSmokeAnimations.push({
        tankId: tank.id,
        frameIndex: 0,
        lastFrameTime: Date.now(),
      });
    }
  } else {
    // If the tank's hitPoints are 2 or more, remove any existing smoke animation
    activeSmokeAnimations = activeSmokeAnimations.filter((anim) => anim.tankId !== tank.id);
  }
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

  if (reactorPlayerId === localPlayerNumber) {
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

  if (fortressPlayerId === localPlayerNumber) {
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

  if (turretPlayerId === localPlayerNumber) {
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

  drawCtx.fillStyle = shellPlayerId === localPlayerNumber ? "blue" : "red";

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
    tankPlayerId === localPlayerNumber
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
        tankPlayerId === localPlayerNumber ? `rgba(0, 0, 255, ${track.opacity})` : `rgba(255, 0, 0, ${track.opacity})`
      );
      gradient.addColorStop(
        1,
        tankPlayerId === localPlayerNumber
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
    tankPlayerId === localPlayerNumber
      ? `rgba(0, 0, 255, ${latestTrack.opacity})`
      : `rgba(255, 0, 0, ${latestTrack.opacity})`
  );
  gradient.addColorStop(1, tankPlayerId === localPlayerNumber ? `rgba(0, 0, 255, 0)` : `rgba(255, 0, 0, 0)`); // Fade out to transparent

  drawCtx.strokeStyle = gradient;
  drawCtx.lineWidth = 2 * scaleX; // Adjust line width based on scaling
  drawCtx.lineCap = "round";

  // Draw the gradient line
  drawCtx.beginPath();
  drawCtx.moveTo(trackX, trackY);
  drawCtx.lineTo(tankX, tankY);
  drawCtx.stroke();
}

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

socket.on("drawingEnabled", (data) => {
  drawingEnabled = true;
  // Optionally, notify the player that they can draw again
});

let isMyTurn = false;

socket.on("turnChanged", (data) => {
  isMyTurn = data.currentTurn === localPlayerNumber;

  updateTimerDisplay(30, data.currentTurn, "TURN"); // Assuming 30 seconds per turn
});

// Client-side code
socket.on("updateTimer", (data) => {
  const { timeLeft, currentTurn, phase } = data;
  updateTimerDisplay(timeLeft, currentTurn, phase);
});

function updateTimerDisplay(timeLeft, currentTurn, phase) {
  const timerElement = document.getElementById("Timer");

  if (phase === "DRAWING") {
    timerElement.textContent = `${timeLeft}`;
    timerElement.classList.remove("enemy-turn");
  } else if (phase === "TURN") {
    if (currentTurn === localPlayerNumber) {
      timerElement.textContent = `${timeLeft}`;
      timerElement.classList.remove("enemy-turn");
    } else {
      timerElement.textContent = `enemy turn`;
      timerElement.classList.add("enemy-turn");
    }
  }
}

function setColorFullOpacity(color) {
  if (color.startsWith("rgba")) {
    // Extract the RGB values
    const matches = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
    if (matches) {
      const [_, r, g, b] = matches;
      return `rgba(${r}, ${g}, ${b}, 1)`;
    } else {
      return color; // Can't parse, return as is
    }
  } else if (color.startsWith("#")) {
    // Hex color, already opaque
    return color;
  } else {
    // Other color format, return as is
    return color;
  }
}

let powerStartTime = 0;
const powerDuration = 650; // Duration to reach 100%

function incrementPower() {
  if (!isMouseDown) {
    stopPowerIncrement();
    return;
  }

  const elapsedTime = Date.now() - powerStartTime;
  powerLevel = Math.min(100, (elapsedTime / powerDuration) * 100);
  powerMeterFill.style.height = `${powerLevel}%`;

  if (powerLevel < 100) {
    requestAnimationFrame(incrementPower);
  } else {
    handleGameMouseUpOut(null, true);
  }
}

function startPowerIncrement() {
  if (isPowerIncrementing) {
    return;
  }
  isPowerIncrementing = true;
  powerLevel = 0;
  powerMeterFill.style.height = `${powerLevel}%`;
  powerStartTime = Date.now();

  // Start the increment
  requestAnimationFrame(incrementPower);
}

function stopPowerIncrement() {
  isPowerIncrementing = false;
  powerLevel = 0;
}

function updateActionModeIndicator() {
  // Remove bullet from both buttons
  moveButton.textContent = moveButton.textContent.replace("•", "").trim();
  shootButton.textContent = shootButton.textContent.replace("•", "").trim();

  // Add bullet to the appropriate button
  if (actionMode === "move") {
    moveButton.textContent += "•";
  } else if (actionMode === "shoot") {
    shootButton.textContent += "•";
  }
}

socket.on("powerCapped", (data) => {
  isMouseDown = false;
  stopPowerIncrement();
});
