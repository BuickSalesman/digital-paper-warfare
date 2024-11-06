const physicsCanvas = document.getElementById("physicsCanvas"); // For Matter.js rendering.

//#region SHELL VARIABLES
let shells = [];

//#endregion SHELL VARIABLES

// Store player's units in array for easy access.
const playerOneUnits = [tank1, tank2, turret1, turret2];
const playerTwoUnits = [tank3, tank4, turret3, turret4];

//#endregion BODY VARIABLES

// Declare variable to store the which player is currently drawing, starting with player 1.
let currentPlayerDrawing = PLAYER_ONE;

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

// Start the game with the draw phase!
initializeDrawPhase();

//#endregion AFTER UPDATE HANDLER

//#region BUTTON EVENT HANDLERS

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

//#region SHAPE DRAWING FUNCTIONS

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

// Handles drawing login during moouse move events.

// Handles completion of a drawing action.

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
