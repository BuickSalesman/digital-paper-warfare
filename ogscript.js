let currentPlayerDrawing = PLAYER_ONE;

const drawingMarginX = tankSize + width * 0.02;

const drawingMarginY = tankSize + height * 0.02;

const dividingLineMargin = tankSize + height * 0.005;

const maxTravelDistance = height * 0.04;

const forceScalingFactor = maxTravelDistance / Math.pow(100, 1.5);

let currentPlayerTurn = PLAYER_ONE;

const DRAW_PHASE_DURATION = 75;
const TURN_PHASE_DURATION = 30;

let drawTimer = null;
let turnTimer = null;

let hasMovedOrShotThisTurn = false;

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

function bodiesMatch(bodyA, bodyB, label1, label2) {
  return (bodyA.label === label1 && bodyB.label === label2) || (bodyA.label === label2 && bodyB.label === label1);
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
