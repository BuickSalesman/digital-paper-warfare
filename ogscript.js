//#region VARIABLES

//#region GAME AND PLAYER VARIABLES

//#region HTML ELEMENT VARIABLES

const physicsCanvas = document.getElementById("physicsCanvas"); // For Matter.js rendering.

//#endregion HTML ELEMENT VARIABLES

//#region CANVAS AND CONTEXT VARIABLES

//#endregion GAME AND PLAYER VARIABLES

//#region MATTER SETUP VARIABLES

// Declare a mouse input object for capturing interactions on the physics canvas.
let mouse = Mouse.create(render.canvas);

// Declare and create the ability for objects to be able to interact with the mouse input object.
let mouseConstraint = MouseConstraint.create(engine, {
  mouse: mouse,
  constraint: {
    // Stiffness controls the mouse's ability to be able to move objects around. 0 for non-interactivity.
    stiffness: 0,
    render: {
      visible: false,
    },
  },
  collisionFilter: {
    mask: 0xffffffff, // Allows interaction with all objects in the world.
  },
});

//#endregion MATTER SETUP VARIABLES

//#region BODY VARIABLES

//Declare walls around the canvas to keep game bodies inside the canvas.
// prettier-ignore
const walls = [
  // Top.
  Bodies.rectangle(
    width / 2,
    -500,
    width + 1000,
    1000,
    {
      isStatic: true,
    }
  ),
  // Bottom.
  Bodies.rectangle(
    width / 2,
    height + 500,
    width + 1000,
    1000,
    {
      isStatic: true,
    }
  ),
  // Left.
  Bodies.rectangle(
    -500,
    height / 2,
    1000,
    height + 1000,
    {
      isStatic: true,
    }
  ),
  // Right.
  Bodies.rectangle(
    width + 500,
    height / 2,
    1000,
    height + 1000,
    {
      isStatic: true,
    }
  ),
];

//#region TANK VARIABLES

let tankSize = width * 0.02; // Allows tank to scale with the canvas width/height.

let tankHitPoints = 2;

//Player 1's tanks.
let tank1 = TankModule.createTank(width * 0.3525, height * 0.9, tankSize, PLAYER_ONE);
let tank2 = TankModule.createTank(width * 0.4275, height * 0.9, tankSize, PLAYER_ONE);

//Player 2's tanks.
let tank3 = TankModule.createTank(width * 0.6475, height * 0.1, tankSize, PLAYER_TWO);
let tank4 = TankModule.createTank(width * 0.5725, height * 0.1, tankSize, PLAYER_TWO);

//Store all tanks in an array for easy access.
let tanks = [tank1, tank2, tank3, tank4];

//#endregion TANK VARIABLES

//#region REACTOR VARIABLES
let reactorSize = tankSize;

let reactorHitPoints = 1;

//Player 1's reactors.
const reactor1 = ReactorModule.createReactor(width * 0.3525, height * 0.95, reactorSize, PLAYER_ONE);
const reactor2 = ReactorModule.createReactor(width * 0.4275, height * 0.95, reactorSize, PLAYER_ONE);

//Player 2's reactors.
const reactor3 = ReactorModule.createReactor(width * 0.6475, height * 0.05, reactorSize, PLAYER_TWO);
const reactor4 = ReactorModule.createReactor(width * 0.5725, height * 0.05, reactorSize, PLAYER_TWO);

//Store all reactors in an array for easy access.
let reactors = [reactor1, reactor2, reactor3, reactor4];

//#endregion REACTOR VARIABLES

//#region FORTRESS VARIABLES
let fortressWidth = width * 0.1475;
let fortressHeight = height * 0.0575;

//Player 1's fortress.
let fortress1 = FortressModule.createFortress(width * 0.39, height * 0.95, fortressWidth, fortressHeight, PLAYER_ONE);

//Player 2's fortress.
let fortress2 = FortressModule.createFortress(width * 0.61, height * 0.05, fortressWidth, fortressHeight, PLAYER_TWO);

//Store all fortresses in an array for easy access.
let fortresses = [fortress1, fortress2];

//#endregion FORTRESS VARIABLES

//#region TURRET VARIABLES
let turretSize = reactorSize * 1.125;

let turretHitPoints = 2;

//Player 1's turrets
const turret1 = TurretModule.createTurret(width * 0.31625, height * 0.92125, turretSize, PLAYER_ONE);
const turret2 = TurretModule.createTurret(width * 0.46375, height * 0.92125, turretSize, PLAYER_ONE);

//Player 2's turrets.
const turret3 = TurretModule.createTurret(width * 0.53625, height * 0.07875, turretSize, PLAYER_TWO);
const turret4 = TurretModule.createTurret(width * 0.68375, height * 0.07875, turretSize, PLAYER_TWO);

//Store all turrets in an array for easy access.
let turrets = [turret1, turret2, turret3, turret4];

//#endregion TURRET VARIABLES

//#region SHELL VARIABLES
let shells = [];

//#endregion SHELL VARIABLES

// Store player's units in array for easy access.
const playerOneUnits = [tank1, tank2, turret1, turret2];
const playerTwoUnits = [tank3, tank4, turret3, turret4];

//#endregion BODY VARIABLES

//#region DRAWING VARIABLES

//#region EXPLOSIONS!!!
const explosionFrames = Array.from({ length: 25 }, (_, i) => {
  const img = new Image();
  img.src = `assets/EXPLOSION/explosion4/${i + 1}.png`; // Adjusted index for 1-based filenames
  return img;
});
//#endregion EXPLOSIONS!!!

// Declare a dividing line halfway between the top and bottom of the canvas.
const dividingLine = drawCanvas.height / 2;

// Declare variable to store the which player is currently drawing, starting with player 1.
let currentPlayerDrawing = PLAYER_ONE;

// Declare counter for number of total shapes drawn.
let shapeCount = 0;

// Declare the maximum number of shapes for each player.
let maxShapeCountPlayer1 = 5;
let maxShapeCountPlayer2 = 5;

// Initialize shape counts for each player
let shapeCountPlayer1 = 0;
let shapeCountPlayer2 = 0;

// Declare maximum amount of ink allocated per shape.
const maxInkPerShape = baseHeight * 0.6;

// Declare variable to help track how much ink a player has used on the shape currently being drawn.
let totalInkUsed = 0;

// Declare variable to store if player is drawing below the dividing line.
let isDrawingBelow = true;

// Declare whether the player is currently drawing.
let isDrawing = false;

// Declare an array to store points creating during drawing.
let drawingPath = [];

// Declare and array to store completed drawing paths.
let allPaths = [];

//#region DRAWING MARGIN VARIABLES

// Declare width of the drawing margin so that it is wide enough for tanks to pass through.
const drawingMarginX = tankSize + width * 0.02;

// Declare height of the drawing margin so that it is high enough for tanks to pass through.
const drawingMarginY = tankSize + height * 0.02;

// Declare height of the margin on either side of the dividing line so that it is big enough for tanks to pass through.
const dividingLineMargin = tankSize + height * 0.005;

// Declare an array to store all no drawing zones.
let noDrawZones = [];

//#endregion DRAWING MARGIN VARIABLES

//#endregion DRAWING VARIABLES

//#region MOVE AND SHOOT VARIABLES

// Declare a variable to store what action state the player is currently in.
let actionMode = null;

// Declare a varibale to store the currently selected unit.
let selectedUnit = null;

// Declare the maximum power level of a shot.
const maxPowerLevel = 100;

// Declare a variable to store power level of a shot.
let powerLevel = 0;

// Declare the maximum distance a tank or shell can travel based on window size.
const maxTravelDistance = height * 0.04;

// Declare a scaling factor for applied force based on the maxTravelDistance.
const forceScalingFactor = maxTravelDistance / Math.pow(100, 1.5);

// Declare starting and ending mouse positions for vector calculation.
let startingMousePosition = null;
let endingMousePosition = null;
// Declare if mouse is down.
let isMouseDown = false;

// Declare if mouse is moving.
let isMouseMoving = false;

//#region WOBBLE EFFECT VARIABLES

// Declare if an object is wobling.
let isWobbling = false;

// Declare the moment at which the wobble effect is applied.
let wobbleStartTime = 0;

// Declare the initial angle of the wobble effect.
let initialWobbleAngle = 0;

// Declare number of frames between wobble oscilation.
const wobbleFrequency = 60;

// Declare maximum rotation angle in radians from the neutral position (about 2.86 degrees).
const wobbleAmplitude = 0.1;

//#endregion WOBBLE EFFECT VARIABLES

//#endregion MOVE AND SHOOT VARIABLES

//#region TURN TIMER VARIABLES

// Declare variable to store which player's turn it is.
let currentPlayerTurn = PLAYER_ONE;

// Define timer durations in seconds
const DRAW_PHASE_DURATION = 75;
const TURN_PHASE_DURATION = 30;

// Declare timer instances
let drawTimer = null;
let turnTimer = null;

// Declare variable to store whether a player has taken an action this turn.
let hasMovedOrShotThisTurn = false;

//#endregion TURN TIMER VARIABLES

//#endregion VARIABLES

//#region CLASSES

class Timer {
  constructor(duration, onTick, onEnd) {
    this.duration = duration; // Total duration of the timer in seconds.
    this.timeLeft = duration; // Remaining time left in the countdown.
    this.onTick = onTick; // Function to call every second with the remaining time.
    this.onEnd = onEnd; // Function to call when timer reaches zero.
    this.intervalId = null; // ID used to clear setInterval.
  }

  // Starts timer countdown.
  start() {
    this.timeLeft = this.duration;
    this.onTick(this.timeLeft);
    this.intervalId = setInterval(() => {
      this.timeLeft--;
      this.onTick(this.timeLeft);
      if (this.timeLeft <= 0) {
        this.stop();
        this.onEnd();
      }
    }, 1000);
  }

  // Stops the tikmer countdown.
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Resets the timer to it's initial duration if it stops running.
  reset() {
    this.stop();
    this.timeLeft = this.duration;
    this.onTick(this.timeLeft);
  }
}

//#endregion CLASSES

//#region SOCKET SETUP

//#endregion SOCKET SETUP

//#region WORLD SETUP

//Disable gravity.
engine.world.gravity.y = 0;
engine.world.gravity.x = 0;

//Run renderer.
Render.run(render);

//Run the runner, this allows the engine to be updated for dynamic use within the browser.
Runner.run(runner, engine);

//Add the ability for mouse input into the physics world.
World.add(world, mouseConstraint);

//#region BODY CREATION

// Add boundary walls to the game world.
World.add(world, walls);

// Add tank(s) to the game world.
World.add(world, tanks);

// Add reactor(s) to the game world.
World.add(world, reactors);

// Add fortress(es) to the game world.
World.add(world, fortresses);

// Add turret(s) to the game world.
World.add(world, turrets);

//#endregion BODY CREATIONS

// Add the fortres no draw zones to the drawing canvas.
fortressNoDrawZone();

// Start the game with the draw phase!
initializeDrawPhase();

//#endregion WORLD SETUP

//#region EVENT HANDLERS

//#region AFTER RENDER HANDLER
// After Render Handler
Events.on(render, "afterRender", function () {
  // Redraw the dividing line and drawings after every engine tick.
  updateAfterRender();

  // Add the ability to draw after every engine tick, provided it is the draw phase.
  if (currentGameState === GameState.PRE_GAME) {
    draw(); // Ensure that the draw function is called during the draw phase.
  }
});

//#endregion AFTER RENDER HANDLER

//#region BEFORE UPDATE HANDLER
Events.on(engine, "beforeUpdate", () => {
  if (currentGameState === GameState.GAME_RUNNING) {
    if (isMouseDown && isMouseMoving) {
      // Ensure power meter cannot increase if the action mode is "move" and the selected unit is a turret.
      processTurretControl();
    }

    // Apply wobble effect if selected unit is a tank.
    if (isWobbling && selectedUnit) {
      applyWobbleEffect();
    }
  }
});

//#endregion BEFORE UPDATE HANDLER

//#region AFTER UPDATE HANDLER

Events.on(engine, "afterUpdate", function () {
  // Handle the resting state of the shell.
  handleShellResting();

  // Handle the resting state of tanks.
  tanks.forEach(function (tank) {
    if (isResting(tank)) {
      fixTankPosition(tank);
    }
  });
});

//#endregion AFTER UPDATE HANDLER

//#region BUTTON EVENT HANDLERS

// Change action mode to "move" if move button is clicked.
moveButton.addEventListener("click", function () {
  actionMode = "move";
});

// Change action mode to "shoot" if shoot button is clicked.
shootButton.addEventListener("click", function () {
  actionMode = "shoot";
});

// Open rules modal when rules button is clicked.
rulesButton.addEventListener("click", openModal);

// Close modal when close button is clicked.
closeButton.addEventListener("click", closeModal);

// Close modal if user clicks outside the children of the rules modal.
window.addEventListener("click", function (event) {
  if (event.target === rulesModal) {
    closeModal();
  }
});

// Handles multiple events for the end draw button ("LETZ PLAY!").
endDrawButton.addEventListener("click", function () {
  // Exit if not in PRE_GAME state
  if (currentGameState !== GameState.PRE_GAME) {
    return;
  }
  // Switch from player one's draw phase to player two's draw phase when hit for the first time.
  if (isPlayerDrawComplete(currentPlayerDrawing)) {
    switchPlayer();
  }
  // If hit a second time, end the second player's draw phase and start the battle phase.
  if (areBothPlayersDoneDrawing()) {
    // Stops the drawing timer and calls endDrawPhase().
    finalizeDrawingPhase();
  }
});

//#endregion BUTTON EVENT HANDLERS

//#region COLLISION HANDLER
Events.on(engine, "collisionStart", function (event) {
  // Save the two bodies that have collided into a pair.
  var pairs = event.pairs;

  pairs.forEach((pair) => {
    const { bodyA, bodyB } = pair;
    const x = (bodyA.position.x + bodyB.position.x) / 2;
    const y = (bodyA.position.y + bodyB.position.y) / 2;

    // Check if a tank collided with a shell
    if (bodiesMatch(bodyA, bodyB, "Tank", "Shell")) {
      const tank = bodyA.label === "Tank" ? bodyA : bodyB;
      const shell = bodyA.label === "Shell" ? bodyA : bodyB;
      // Remove hitpoints or destroy tank. End the game if both of a single player's tanks are destroyed.
      handleTankDestruction(tank, shell, engine, drawCtx);
    }

    // Check if a shell collided with a reactor
    if (bodiesMatch(bodyA, bodyB, "Shell", "Reactor")) {
      const reactor = bodyA.label === "Reactor" ? bodyA : bodyB;
      const shell = bodyA.label === "Shell" ? bodyA : bodyB;
      // Remove hit points and end the game.
      handleReactorDestruction(reactor, shell, engine, drawCtx);
    }

    // Remove the shell if it hits a shape
    if (bodiesMatch(bodyA, bodyB, "Shell", "Shape")) {
      const shell = bodyA.label === "Shell" ? bodyA : bodyB;
      World.remove(engine.world, shell);
    }
  });
});
//#endregion COLLISION HANDLER

//#endregion EVENT HANDLERS

//#region MOUSE EVENTS

Events.on(mouseConstraint, "mousedown", function (event) {
  if (currentGameState === GameState.PRE_GAME) {
    //draw stuff
    startDrawing(event);
  }
  if (currentGameState === GameState.GAME_RUNNING) {
    //shoot stuff
    saveClickPoint(event);
  }
  if (currentGameState === GameState.POST_GAME) {
    //restart stuff
  }
});

Events.on(mouseConstraint, "mousemove", function (event) {
  if (currentGameState === GameState.PRE_GAME) {
    //draw stuff
    draw(event);
  }
  if (currentGameState === GameState.GAME_RUNNING) {
    isMouseMoving = true;
    //shoot stuff
  }
  if (currentGameState === GameState.POST_GAME) {
    //restart stuff
  }
});

Events.on(mouseConstraint, "mouseup", function (event) {
  if (currentGameState === GameState.PRE_GAME) {
    //draw stuff
    endDrawing(event);
  }
  if (currentGameState === GameState.GAME_RUNNING) {
    //shoot stuff
    endingMousePosition = { x: event.mouse.position.x, y: event.mouse.position.y };
    releaseAndApplyForce(endingMousePosition);
  }
  if (currentGameState === GameState.POST_GAME) {
    //restart stuff
  }
});

//#endregion MOUSE EVENTS

//#region FUNCTIONS

//#region MODAL HELPER FUNCTIONS

// Function to open the rules modal.
function openModal() {
  rulesModal.style.display = "block";
}

// Function to close the rules modal.
function closeModal() {
  rulesModal.style.display = "none";
}
//#endregion MODAL HELPER FUNCTIONS

//#region TURN AND TIMER FUNCTIONS

// Initializes and starts the draw phase timer.
function initializeDrawPhase() {
  if (currentGameState === GameState.PRE_GAME) {
    // Initialize the draw phase timer.
    drawTimer = new Timer(DRAW_PHASE_DURATION, updateDrawTimerDisplay, endDrawPhase);

    // Starts the draw phase timer.
    drawTimer.start();
  }
}

// Initializes and starts the turn timer.
function startTurnTimer() {
  // If turn timer already exists, stop it.
  if (turnTimer) {
    turnTimer.stop();
    turnTimer.reset();
  }

  // Make sure at the start of each turn that the player is able to perform an action.
  hasMovedOrShotThisTurn = false;

  // Initialize the turn timer.
  turnTimer = new Timer(TURN_PHASE_DURATION, updateTurnTimerDisplay, endTurn);

  // Start the turn timer.
  turnTimer.start();
}

// Updates the draw timer display.
function updateDrawTimerDisplay(timeLeft) {
  if (timerElement) {
    timerElement.textContent = `${timeLeft}`;
  }
}

// Updates the turn timer display.
function updateTurnTimerDisplay(timeLeft) {
  if (timerElement) {
    timerElement.textContent = `${timeLeft}`;
  }
}

// Ends the current turn and switches to the next players turn.
function endTurn() {
  currentPlayerTurn = currentPlayerTurn === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  startTurnTimer();
}

// Finalizes drawing phase and transitions to the next game state.
function finalizeDrawingPhase() {
  if (drawTimer) {
    // Stop the drawing timer.
    drawTimer.stop();
    // Obliterate draw timer from existence.
    drawTimer = null;
  }
  // Changes game state, creates Matter bodies from drawn shapes, flips a coin for who goes first, starts the turn timer.
  endDrawPhase();
}

//#endregion TURN AND TIMER FUNCTIONS

//#region COIN FLIP FUNCTIONS
function coinFlip() {
  // Randomly decide which player goes first.
  const result = Math.random() < 0.5 ? PLAYER_ONE : PLAYER_TWO;

  // Set the current player's turn based on the coin flip result.
  currentPlayerTurn = result;

  // Display the result in the console or on the UI.
  alert(`Player ${currentPlayerTurn} wins the coin flip and goes first!`);
}
//#endregion COIN FLIP FUNCTIONS

//#region DRAWING FUNCTIONS

//#region NO-DRAW ZONES FUNCTIONS

// Creates no-draw zones around fortresses to prevent overlapping drawings.
function fortressNoDrawZone() {
  fortresses.forEach((fortress) => {
    const zone = createRectangularZone(
      fortress.position.x,
      fortress.position.y,
      fortressWidth,
      fortressHeight,
      baseHeight * 0.05
    );
    // Add both player's no draw zones into the noDrawZones array.
    noDrawZones.push(zone);
  });
}

// Creates a rectangular no-drawn-zone with padding.
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

// Draw all no draw zones on the drawing canvas.
function drawNoDrawZones() {
  drawCtx.strokeStyle = "red";
  drawCtx.lineWidth = 2;
  noDrawZones.forEach((zone) => {
    drawCtx.beginPath();
    drawCtx.moveTo(zone[0].x, zone[0].y);
    for (let i = 1; i < zone.length; i++) {
      drawCtx.lineTo(zone[i].x, zone[i].y);
    }
    drawCtx.closePath();
    drawCtx.stroke();

    // Draw the X inside the rectangle.
    drawCtx.beginPath();
    // Diagonal from Top-Left to Bottom-Right.
    drawCtx.moveTo(zone[0].x, zone[0].y);
    drawCtx.lineTo(zone[2].x, zone[2].y);
    // Diagonal from Top-Right to Bottom-Left.
    drawCtx.moveTo(zone[1].x, zone[1].y);
    drawCtx.lineTo(zone[3].x, zone[3].y);
    drawCtx.stroke();
  });
}

// Clears any no draw zones from the drawing canvas.
function removeFortressNoDrawZones() {
  // Clear the drawing canvas entirely.
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Clear all data from the noDrawZones array.
  noDrawZones = [];
}

//#endregion NO-DRAW ZONES FUNCTIONS

//#region EXPLOSION!!! FUNCTIONS

// Draws an explosion animation at the specified coordinates.
function handleExplosion(context, x, y, frame = 0) {
  if (frame < explosionFrames.length) {
    context.clearRect(x - 50, y - 50, 100, 100);
    context.drawImage(explosionFrames[frame], x - 50, y - 50, 100, 100); // Adjust size and position as needed
    setTimeout(() => handleExplosion(context, x, y, frame + 1), 45); // Advance to the next frame every 45ms
  }
}

// EXPLODES!
function handleBodyExplosion(body) {
  handleExplosion(drawCtx, body.position.x, body.position.y, 0);
}

//#endregion EXPLOSION!!! FUNCTIONS

//#region DIVIDING LINE FUNCTIONS

// Draws the dividing line on the canvas.
function drawDividingLine() {
  drawCtx.beginPath();
  drawCtx.moveTo(0, dividingLine);
  drawCtx.lineTo(drawCanvas.width, dividingLine);
  drawCtx.strokeStyle = "black";
  drawCtx.lineWidth = 2;
  drawCtx.stroke();
}

//#endregion DIVIDING LINE FUNCTIONS

//#region SHAPE DRAWING FUNCTIONS

// Redraws all existing shapes on the draw canvas.
function redrawAllShapes() {
  // Iterate over each path in the allPaths array.
  allPaths.forEach((path) => {
    // Proceed only if the current path has at least one point.
    if (path.length > 0) {
      drawCtx.beginPath(); // Start a new path.
      drawCtx.moveTo(path[0].x, path[0].y); // Move cursor to first point of path.

      // Draw lines connecting each subsequent point of the path.
      for (let i = 1; i < path.length; i++) {
        drawCtx.lineTo(path[i].x, path[i].y);
      }

      drawCtx.closePath(); // Close path for a complete shape.
      drawCtx.strokeStyle = "blue"; // Shape color.
      drawCtx.lineWidth = 2; // Shape line width.
      drawCtx.stroke(); // Render the stroke on the drawing canvas.
    }
  });

  // Redraw no-draw zones if in pre-game state
  if (currentGameState === GameState.PRE_GAME) {
    drawNoDrawZones();
  }
}

// Generates an array of points along a line.
function getLinePoints(x0, y0, x1, y1) {
  // Initialize an array to store generate points.
  const points = [];

  // Round the starting and ending coordinates to the nearest integer.
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);

  // Calculate the difference in the x and y directions.
  let dx = x1 - x0;
  let dy = y1 - y0;

  // Determine the number of steps based on the larger of dx or dy.
  let steps = Math.max(Math.abs(dx), Math.abs(dy));

  // If the line is a single point, add it to the array and return.
  if (steps === 0) {
    points.push({ x: x0, y: y0 });
    return points;
  }

  // Calculate the incremental steps for x and y.
  let xStep = dx / steps;
  let yStep = dy / steps;

  // Initialize current x and y positions.
  let x = x0;
  let y = y0;

  // Iterate over each step to generate and store the points.
  for (let i = 0; i <= steps; i++) {
    points.push({ x: Math.round(x), y: Math.round(y) });
    x += xStep;
    y += yStep;
  }

  // Return the array of points along the line.
  return points;
}

// Checks if two polygons overlap, return boolean.
function polygonsOverlap(polygonA, polygonB) {
  // Check if any edges of polygonA intersect with any edges of polygonB.
  for (let i = 0; i < polygonA.length; i++) {
    const a1 = polygonA[i];
    const a2 = polygonA[(i + 1) % polygonA.length];

    for (let j = 0; j < polygonB.length; j++) {
      const b1 = polygonB[j];
      const b2 = polygonB[(j + 1) % polygonB.length];

      //Check if the current edges intersect.
      if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
        return true; // Polygons overlap
      }
    }
  }

  // Check if one polygon is completely inside another.
  if (isPointInPolygon(polygonA[0], polygonB) || isPointInPolygon(polygonB[0], polygonA)) {
    return true; // One polygon is inside the other.
  }

  return false; // Polygons do not overlap.
}

// Determines if two line segments overlap, returns boolean.
function doLineSegmentsIntersect(p0, p1, p2, p3) {
  // Calculate the differences in the x and y directions for the first segment.
  const s1X = p1.x - p0.x;
  const s1Y = p1.y - p0.y;

  // Calculate the differences in the x and y directions for the second segment.
  const s2X = p3.x - p2.x;
  const s2Y = p3.y - p2.y;

  // Calculate the denominator to determine if lines are parallel.
  const denominator = -s2X * s1Y + s1X * s2Y;
  if (denominator === 0) {
    return false; // Lines are parallel.
  }

  // Calculate parameter s to find the intersection point.
  const s = (-s1Y * (p0.x - p2.x) + s1X * (p0.y - p2.y)) / denominator;

  // Calculate parameter t to find the intersection point.
  const t = (s2X * (p0.y - p2.y) - s2Y * (p0.x - p2.x)) / denominator;

  // If both s and t are between 0 and 1, the segments intersect.
  if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
    return true; // Collision detected.
  }

  return false; // No collision.
}

// Checks if point is inside of a polygon, using ray-casting algorithm, returns boolean.
function isPointInPolygon(point, polygon) {
  // Initialize collision flag to track intersections.
  let collision = false;

  // Variable to hold the index of the next vertex.
  let next = 0;

  // Iterate through each edge of the polygon.
  for (let current = 0; current < polygon.length; current++) {
    next = (current + 1) % polygon.length;

    // Current vertex of the polygon.
    const vc = polygon[current];

    // Next vertex of the polygon.
    const vn = polygon[next];

    // Check if the horizontal ray intersects with the edge.
    if (
      vc.y > point.y !== vn.y > point.y && // Check if point.y is between vc.y and vn.y.
      point.x < ((vn.x - vc.x) * (point.y - vc.y)) / (vn.y - vc.y + 0.00001) + vc.x // Check if point.x is to the left of the intersection.
    ) {
      collision = !collision; // Toggle collision flag on intersection.
    }
  }
  return collision; // Return whether the point is inside the polygon.
}

// Clears and redraws all existing shapes and the dividing line on the draw canvas.
function redrawCanvas() {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  drawDividingLine();
  redrawAllShapes();
}

// Matter body from shape generator. Generates a small circle body on top of every point in the lines of a polygon.
function createBodiesFromShapes() {
  // Iterate through each path in allPaths.
  for (let i = 0; i < allPaths.length; i++) {
    // Current path.
    const path = allPaths[i];

    const circleRadius = 2; // 2px radius helps prevent clipping.

    // Create circles along the line segments of the path.
    for (let j = 0; j < path.length - 1; j++) {
      const startPoint = path[j];
      const endPoint = path[j + 1];

      // Use linear interpolation to get every point along the line.
      const points = getLinePoints(startPoint.x, startPoint.y, endPoint.x, endPoint.y);

      points.forEach((point) => {
        const circle = Bodies.circle(point.x, point.y, circleRadius, {
          isStatic: true,
          label: "Shape",
          render: { fillStyle: "black" },
          collisionFilter: {
            group: 0,
            category: CATEGORY_SHAPE,
            mask: CATEGORY_SHELL | CATEGORY_TANK,
          },
          friction: 0.005,
          restitution: 0,
        });
        // Add the circle to the physics world.
        World.add(engine.world, circle);
      });
    }
  }

  // Clear the allPaths array when finished.
  allPaths = [];
}

// Begins drawing process when mouse is pressed.
function startDrawing() {
  if (currentGameState !== GameState.PRE_GAME) {
    return;
  }
  const mousePosition = { ...mouseConstraint.mouse.position };

  // Enforce drawing area per player.
  if (currentPlayerDrawing === PLAYER_ONE) {
    // Player one draws below the dividing line.
    isDrawingBelow = true;
    mousePosition.y = Math.max(mousePosition.y, dividingLine + dividingLineMargin);
  } else if (currentPlayerDrawing === PLAYER_TWO) {
    // Player two draws above the dividing line.
    isDrawingBelow = false;
    mousePosition.y = Math.min(mousePosition.y, dividingLine - dividingLineMargin);
  }

  // Clamp mouse position within drawable area horizontally.
  mousePosition.x = Math.max(drawingMarginX, Math.min(mousePosition.x, width - drawingMarginX));

  // Clamp mouse position within drawable area vertically.
  mousePosition.y = Math.max(drawingMarginY, Math.min(mousePosition.y, height - drawingMarginY));

  // Reset the total ink for the new drawing session.
  totalInkUsed = 0;

  // Set the drawing state to active.
  isDrawing = true;

  // Initialize the drawing path with the current mouse position.
  drawingPath = [mousePosition];
}

// Handles drawing login during moouse move events.
function draw(event) {
  // Exit if the game state is not PRE_GAME.
  if (currentGameState !== GameState.PRE_GAME) {
    return;
  }

  // Exit if drawing is not active.
  if (!isDrawing) {
    return;
  }

  // Close the current mouse position.
  const mousePosition = { ...mouseConstraint.mouse.position };

  // Enforce drawing area per player.
  if (currentPlayerDrawing === PLAYER_ONE) {
    mousePosition.y = Math.max(mousePosition.y, dividingLine + dividingLineMargin);
  } else if (currentPlayerDrawing === PLAYER_TWO) {
    mousePosition.y = Math.min(mousePosition.y, dividingLine - dividingLineMargin);
  }

  // Clamp mouse position within drawable area horizontally.
  mousePosition.x = Math.max(drawingMarginX, Math.min(mousePosition.x, width - drawingMarginX));

  // Clamp mouse position within drawable area vertically.
  mousePosition.y = Math.max(drawingMarginY, Math.min(mousePosition.y, height - drawingMarginY));

  // Grab the last point in the current drawing path.
  const lastPoint = drawingPath[drawingPath.length - 1];

  //Calculate the difference in X and Y between the current and last points.
  const dx = mousePosition.x - lastPoint.x;
  const dy = mousePosition.y - lastPoint.y;

  // Good ol' scared-of-beans-man.
  const segmentLength = Math.hypot(dx, dy);

  // Check if adding this segment would exceed max ink.
  if (totalInkUsed + segmentLength > maxInkPerShape) {
    // Calculate the remaining ink available for drawing.
    const remainingInk = maxInkPerShape - totalInkUsed;

    // Determine the ratio of segment length to remaining ink.
    const ratio = remainingInk / segmentLength;

    if (ratio > 0) {
      // Calculate the X coordinate where the ink limit is reached using the remaining ink ratio.
      const limitedX = lastPoint.x + dx * ratio;

      // Calculate the Y coordinate where the ink limit is reached using the remaining ink ratio.
      const limitedY = lastPoint.y + dy * ratio;

      // Add the constrained point to the drawing path to ensure ink usage does not exceed the limit.
      drawingPath.push({ x: limitedX, y: limitedY });

      // Update the total ink used to the maximum allowed.
      totalInkUsed = maxInkPerShape;
    }
    // Stop drawing.
    isDrawing = false;
    endDrawing();
    return;
  } else {
    // Increment total ink used by the length of the new segment.
    totalInkUsed += segmentLength;

    // Add the current mouse position to the drawing path.
    drawingPath.push(mousePosition);
  }

  // Clear and redraw the canvas.
  redrawCanvas();

  // Begin a new path for drawing.
  drawCtx.beginPath();

  // Move to the starting point of the drawing path.
  drawCtx.moveTo(drawingPath[0].x, drawingPath[0].y);

  // Draw lines to each subsequent point in the drawing path.
  for (let i = 1; i < drawingPath.length; i++) {
    drawCtx.lineTo(drawingPath[i].x, drawingPath[i].y);
  }

  // Change color based on ink usage.
  const inkUsageRatio = totalInkUsed / maxInkPerShape;
  if (inkUsageRatio > 0.66) {
    drawCtx.strokeStyle = "red";
  } else if (inkUsageRatio > 0.33) {
    drawCtx.strokeStyle = "orange";
  } else {
    drawCtx.strokeStyle = "blue";
  }

  // Set line width of the stroke.
  drawCtx.lineWidth = 2;

  // Render stroke on drawing canvas.
  drawCtx.stroke();
}

// Handles completion of a drawing action.
function endDrawing() {
  // End drawing.
  isDrawing = false;

  // Proceed only if the drawing path has more than one point.
  if (drawingPath.length > 1) {
    const firstPoint = drawingPath[0]; // Starting point.
    const lastPoint = drawingPath[drawingPath.length - 1]; // Ending point.

    // Calculate the distance between first and last points.
    const distance = Math.hypot(lastPoint.x - firstPoint.x, lastPoint.y - firstPoint.y);

    // Threshold to determine if the shape should be closed.
    const snapThreshold = 1;

    if (distance <= snapThreshold) {
      // Snap the last point to the first point to close the shape.
      drawingPath[drawingPath.length - 1] = { x: firstPoint.x, y: firstPoint.y };
    } else {
      // Close the shape by connecting the last point to the first point.
      drawingPath.push({ x: firstPoint.x, y: firstPoint.y });
    }

    // Initialize overlap flag.
    let overlaps = false;

    // Check for overlaps with existing shapes in allPaths.
    for (let i = 0; i < allPaths.length; i++) {
      if (polygonsOverlap(drawingPath, allPaths[i])) {
        overlaps = true;
        break;
      }
    }

    // Check overlap with no-draw zones.
    if (!overlaps) {
      for (let i = 0; i < noDrawZones.length; i++) {
        if (polygonsOverlap(drawingPath, noDrawZones[i])) {
          overlaps = true;
          break;
        }
      }
    }

    if (overlaps) {
      // Alert the user about the invalid shape
      // alert("Shapes cannot overlap, or be in no draw zones. Try drawing again.");

      // Clear the drawing.
      redrawCanvas();
    } else {
      // Shape is valid, add it to allPaths.
      allPaths.push([...drawingPath]);

      // Increment shape count for current player.
      if (currentPlayerDrawing === PLAYER_ONE) {
        shapeCountPlayer1++;
        if (shapeCountPlayer1 >= maxShapeCountPlayer1) {
          // Switch to player 2.
          currentPlayerDrawing = PLAYER_TWO;
        }
      } else if (currentPlayerDrawing === PLAYER_TWO) {
        shapeCountPlayer2++;
        if (shapeCountPlayer2 >= maxShapeCountPlayer2) {
          // Both players have finished drawing.
          finalizeDrawingPhase();
        }
      }

      // Clear the drawing and redraw all shapes.
      redrawCanvas();
    }
  }
}

// Redraws the dividing line and all shapes after each engine tick.
function updateAfterRender() {
  // Redraw the dividing line
  drawDividingLine();

  // Redraw all shapes and no-draw zones if in pre-game state.
  if (currentGameState === GameState.PRE_GAME) {
    redrawAllShapes();
  }
}

//#endregion SHAPE DRAWING FUNCTIONS

//#region END DRAW BUTTON FUNCTIONS

// Checks if a player has completed their drawing quota.
function isPlayerDrawComplete(player) {
  if (player === PLAYER_ONE && shapeCountPlayer1 < maxShapeCountPlayer1) {
    shapeCountPlayer1 = maxShapeCountPlayer1; // Set player one's shape count to maximum.
    return true; // Player one has completed drawing.
  } else if (player === PLAYER_TWO && shapeCountPlayer2 < maxShapeCountPlayer2) {
    shapeCountPlayer2 = maxShapeCountPlayer2; // Set player two's shape count to maximum.
    return true; // Player two has completed drawing.
  }
  return false; // Player has not yet completed drawing.
}

// Switches the current player between PLAYER_ONE and PLAYER_TWO.
function switchPlayer() {
  currentPlayerDrawing = currentPlayerDrawing === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
}

// Determines if both players have completed their drawing quotas.
function areBothPlayersDoneDrawing() {
  return shapeCountPlayer1 === maxShapeCountPlayer1 && shapeCountPlayer2 === maxShapeCountPlayer2;
}

// Ends the drawing phase and transitions the game to the running state.
function endDrawPhase() {
  currentGameState = GameState.GAME_RUNNING; // Update game state to running.
  createBodiesFromShapes(); // Generate physics bodies from the drawn shapes.
  removeFortressNoDrawZones(); // Remove no-draw zones
  setTimeout(() => coinFlip(), 500); // Initiate a coin flip after a short delay.
  startTurnTimer(); // Start the timer for the first player's turn.
}

//#endregion END DRAW BUTTON FUNCTIONS

//#endregion DRAWING FUNCTIONS

//#region BEFORE UPDATE HELPER FUNCTIONS

// Helper function to check if the selected unit is one of the turrets
function isSelectedTurret(unit) {
  return turrets.includes(unit);
}

// Helper function to handle the logic when the mouse is down and moving
function processTurretControl() {
  if (isSelectedTurret(selectedUnit) && actionMode === "move") {
    return; // Do nothing if the selected turret is in "move" action mode
  }
  increasePower(); // Otherwise, increase power
}

//#endregion BEFORE UPDATE HELPER FUNCTIONS

//#region AFTER UPDATE HELPER FUNCTIONS

// Helper function to check if a body is resting (i.e., has negligible velocity).
function isResting(body, threshold = 0.1) {
  const velocityMagnitude = Math.hypot(body.velocity.x, body.velocity.y);
  return velocityMagnitude < threshold;
}

// Helper function to stop any residual motion and fix the tank's position.
function fixTankPosition(tank) {
  Body.setVelocity(tank, { x: 0, y: 0 });
  Body.setAngularVelocity(tank, 0);

  if (!tank.fixedConstraint) {
    tank.fixedConstraint = Constraint.create({
      bodyA: tank,
      pointB: { x: tank.position.x, y: tank.position.y },
      stiffness: 1,
      length: 0,
      render: { visible: false },
    });
    World.add(engine.world, tank.fixedConstraint);
  }
}

// Helper function to handle the removal of the shell when resting.
function handleShellResting() {
  // Iterate backwards to always remove the last shell fired that has not collided with an object.
  for (let i = shells.length - 1; i >= 0; i--) {
    const shell = shells[i];
    if (isResting(shell)) {
      World.remove(world, shell);
      shells.splice(i, 1); // Remove the shell from the array
    }
  }
}

//#endregion AFTER UPDATE HELPER FUNCTIONS

//#region COLLISION HANDLER HELPER FUNCTIONS

function bodiesMatch(bodyA, bodyB, label1, label2) {
  return (bodyA.label === label1 && bodyB.label === label2) || (bodyA.label === label2 && bodyB.label === label1);
}

// Helper function to reduce hit points and remove the body if destroyed
function reduceHitPoints(body, engine, removalCallback) {
  body.hitPoints -= 1;
  if (body.hitPoints <= 0) {
    World.remove(engine.world, body);
    removalCallback();
  } else {
    // Optionally, update body appearance to indicate damage
    body.render.strokeStyle = "orange"; // Change color to indicate damage
  }
}

// Helper function to handle tank destruction
function handleTankDestruction(tank, shell, engine, context) {
  handleExplosion(context, tank.position.x, tank.position.y, 0);
  World.remove(engine.world, shell);

  reduceHitPoints(tank, engine, () => {
    handleExplosion(context, tank.position.x, tank.position.y, 0);
    checkAllTanksDestroyed();
  });
}

// Helper function to handle reactor destruction
function handleReactorDestruction(reactor, shell, engine, context) {
  handleExplosion(context, reactor.position.x, reactor.position.y, 0);
  World.remove(engine.world, shell);

  reduceHitPoints(reactor, engine, () => {
    handleExplosion(context, reactor.position.x, reactor.position.y, 0);
    declareReactorWinner(reactor.playerId);
  });
}

// Declare the winner based on reactor destruction
function declareReactorWinner(losingPlayerId) {
  const winningPlayerId = losingPlayerId === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;
  setTimeout(() => {
    alert(`Player ${winningPlayerId} wins! Dismiss this to replay.`);
    location.reload();
  }, 1000);
}

// Function to check if all tanks of a player are destroyed
function checkAllTanksDestroyed() {
  const player1TanksDestroyed = tank1.hitPoints <= 0 && tank2.hitPoints <= 0;
  const player2TanksDestroyed = tank3.hitPoints <= 0 && tank4.hitPoints <= 0;

  if (player1TanksDestroyed) {
    setTimeout(() => {
      alert("Player 2 wins! Dismiss this to replay.");
      location.reload(); // Refresh the page to restart the game
    }, 1000);
  } else if (player2TanksDestroyed) {
    setTimeout(() => {
      alert("Player 1 wins! Dismiss this to replay.");
      location.reload(); // Refresh the page to restart the game
    }, 1000);
  }
}

//#endregion COLLISION HANDLER HELPER FUNCTIONS

//#region MOVE AND SHOOT FUNCTIONS

// INCREASE POWER CALLED IN BEFOREUPDATE
function startWobble() {
  if (!isWobbling && selectedUnit && selectedUnit.label === "Tank") {
    isWobbling = true;
    wobbleStartTime = Date.now();
    initialWobbleAngle = selectedUnit.angle;
  }
}

function applyWobbleEffect() {
  const elapsedTime = Date.now() - wobbleStartTime;
  const wobbleAngle = wobbleAmplitude * Math.cos(elapsedTime / wobbleFrequency);
  Body.setAngle(selectedUnit, initialWobbleAngle + wobbleAngle);
}

// To increase power meter when called.
function increasePower() {
  if (!actionMode || powerLevel >= maxPowerLevel) {
    return;
  }

  powerLevel = Math.min(powerLevel + 3.5, maxPowerLevel);
  powerMeterFill.style.height = `${powerLevel}%`;
  console.log(powerLevel);

  if (powerLevel >= maxPowerLevel) {
    releaseAndApplyForce(getCurrentMousePosition());
  }
}

// To reset power meter when called.
function resetPower() {
  powerLevel = 0;
  powerMeterFill.style.height = "0%";
  isMouseDown = false;
}

// To get the current mouse position.
function getCurrentMousePosition() {
  return {
    x: mouseConstraint.mouse.position.x,
    y: mouseConstraint.mouse.position.y,
  };
}

// To save the x,y coords of mouse click within a unit (tank or turret).
function saveClickPoint(event) {
  isMouseMoving = false;

  if (hasMovedOrShotThisTurn) {
    return;
  }

  const mousePosition = event.mouse.position;
  const unit = getUnitAtPosition(mousePosition);

  if (unit && unit.playerId === currentPlayerTurn) {
    isMouseDown = true;
    startingMousePosition = { x: mousePosition.x, y: mousePosition.y };
    selectedUnit = unit;

    if (unit.label === "Tank") {
      startWobble();
    }
  }
}

// Helper function to get the unit (tank or turret) at a given position.
function getUnitAtPosition(position) {
  return [...tanks, ...turrets].find((unit) => Bounds.contains(unit.bounds, position)) || null;
}

// To apply normalized force and direction to the unit based on action mode.
function releaseAndApplyForce(endingMousePosition) {
  if (!isMouseDown || !selectedUnit) {
    return;
  }

  isMouseDown = false;

  if (isWobbling) {
    stopWobble();
  }

  const vector = calculateVector(startingMousePosition, endingMousePosition);
  if (!vector) {
    resetPower();
    return;
  }

  const { normalizedVector, forceMagnitude } = calculateForce(vector);

  let actionTaken = false;

  if (powerLevel > 0) {
    if (actionMode === "move") {
      actionTaken = applyMoveForce(normalizedVector, forceMagnitude);
    } else if (actionMode === "shoot") {
      actionTaken = applyShootForce(normalizedVector, forceMagnitude);
    }
  }

  resetPower();

  if (actionTaken && !hasMovedOrShotThisTurn) {
    hasMovedOrShotThisTurn = true;
    endTurn();
  }
}

// Helper function to stop the wobble effect.
function stopWobble() {
  isWobbling = false;
  Body.setAngle(selectedUnit, initialWobbleAngle);
}

// Helper function to calculate the vector between two points.
function calculateVector(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length === 0) {
    return null;
  }

  return { x: deltaX / length, y: deltaY / length };
}

// Helper function to calculate normalized vector and force magnitude.
function calculateForce(vector) {
  const scaledPower = Math.pow(powerLevel, 1.5);
  let forceMagnitude = scaledPower * forceScalingFactor * 0.1;

  // Adjust force based on power level.
  const adjustment = getForceAdjustment(powerLevel);
  forceMagnitude *= 1 + adjustment / 100;

  return { normalizedVector: vector, forceMagnitude };
}

// Helper function to determine force adjustment based on power level.
function getForceAdjustment(power) {
  if (power > 95) {
    return -5 * (power - 95);
  } else if (power >= 85 && power <= 95) {
    return 5 * (power - 85);
  }
  return 0;
}

// Helper function to apply force in move mode.
function applyMoveForce(normalizedVector, forceMagnitude) {
  if (selectedUnit.fixedConstraint) {
    World.remove(engine.world, selectedUnit.fixedConstraint);
    selectedUnit.fixedConstraint = null;
  }

  Body.applyForce(selectedUnit, selectedUnit.position, {
    x: -normalizedVector.x * forceMagnitude,
    y: -normalizedVector.y * forceMagnitude,
  });

  console.log(forceMagnitude);
  return true;
}

// Helper function to apply force in shoot mode.
function applyShootForce(normalizedVector, forceMagnitude) {
  const shellSize = 5; // Adjust as needed
  const unitSize = selectedUnit.label === "Tank" ? tankSize : turretSize;
  const shellOffset = unitSize / 2 + shellSize / 2;
  const shellPosition = {
    x: selectedUnit.position.x - normalizedVector.x * shellOffset,
    y: selectedUnit.position.y - normalizedVector.y * shellOffset,
  };

  const initialVelocity = {
    x: -normalizedVector.x * forceMagnitude * 3,
    y: -normalizedVector.y * forceMagnitude * 3,
  };

  const playerId = getPlayerId(selectedUnit);

  createAndLaunchShell(shellPosition, shellSize, initialVelocity, playerId);

  console.log(forceMagnitude);
  return true;
}

// Helper function to determine player ID based on the selected unit.
function getPlayerId(unit) {
  if (playerOneUnits.includes(unit)) {
    return PLAYER_ONE;
  }
  if (playerTwoUnits.includes(unit)) {
    return PLAYER_TWO;
  }
  return null;
}

// Helper function to create and launch a shell.
function createAndLaunchShell(position, size, velocity, playerId) {
  const shell = ShellModule.createShell(position.x, position.y, size, velocity, playerId);
  World.add(world, shell);
  shells.push(shell);
}

//#endregion MOVE AND SHOOT FUNCTIONS

//#endregion FUNCTIONS

//#region BUG LOG
// When shapes are snapped shut after using the maximum amount of ink, it throws the shapes cannot overlap alert.
// It is possible to shoot yourself if your power is low enough.
//#endregion BUG LOG
