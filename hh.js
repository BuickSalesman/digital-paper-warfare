Variables
Power Meter Variables:
powerLevel (let powerLevel = 0;)
Tracks the current power level of an action (e.g., moving or shooting).
powerIncrementInterval (let powerIncrementInterval = null;)
Used to control the timing of power level increments.
isPowerIncrementing (let isPowerIncrementing = false;)
Flag indicating whether the power level is currently being incremented.
powerMeterFill (const powerMeterFill = document.getElementById("powerMeterFill");)
HTML element representing the visual fill of the power meter on the client UI.
powerStartTime (let powerStartTime = 0;)
Timestamp marking when the power increment started.
powerDuration (const powerDuration = 650;)
Total duration (in milliseconds) it takes for the power meter to reach 100%.
Mouse Data Variables:
isMouseDown (let isMouseDown = false;)
Tracks whether the mouse button is currently pressed down.
lastMouseEvent (let lastMouseEvent = null;)
Stores the last mouse event object for reference in other functions.
actionMode (let actionMode = "move";)
Indicates the current action mode of the client, either "move" or "shoot".
Socket and Turn Variables:
socket (const socket = io();)
Represents the Socket.IO client used for real-time communication with the server.
isMyTurn (let isMyTurn = false;)
Flag indicating if it's the local player's turn in the game.
Functions
Power Meter Functions:
incrementPower()

javascript
Copy code
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
Increments the powerLevel over time until it reaches 100% or the mouse button is released.
Updates the visual powerMeterFill accordingly.
Calls handleGameMouseUpOut with forced = true when power reaches 100%.
startPowerIncrement()

javascript
Copy code
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
Initializes variables and starts the power increment process.
Sets isPowerIncrementing to prevent multiple increments.
stopPowerIncrement()

javascript
Copy code
function stopPowerIncrement() {
  isPowerIncrementing = false;
  powerLevel = 0;
}
Stops the power increment process and resets the powerLevel.
Mouse Event Handlers:
handleMouseDown(evt)

javascript
Copy code
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
General handler for mouse down events.
Delegates to handleGameMouseDown when the game is running.
handleGameMouseDown(evt)

javascript
Copy code
function handleGameMouseDown(evt) {
  if (evt.button === 0) {
    // Mouse is already held down; prevent duplicate actions

    lastMouseEvent = evt;

    const mousePos = getMousePos(evt);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    // Emit mouseDown event to the server
    socket.emit("mouseDown", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
      button: evt.button,
      actionMode: actionMode,
    });

    // Additional logic for unit selection and wobble (omitted for brevity)
  }
}
Handles mouse down events during the game.
Sends mouseDown event to the server with mouse coordinates and action mode.
handleMouseMove(evt)

javascript
Copy code
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
General handler for mouse move events.
Delegates to handleGameMouseMove when the game is running.
handleGameMouseMove(evt)

javascript
Copy code
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

  // Additional logic for unit hover and wobble (omitted for brevity)
}
Handles mouse move events during the game.
Sends mouseMove event to the server with current mouse coordinates if the mouse is down.
handleMouseUpOut(evt, forced = false)

javascript
Copy code
function handleMouseUpOut(evt, forced = false) {
  switch (currentGameState) {
    case GameState.PRE_GAME:
      handleDrawingMouseUpOut(evt);
      break;
    case GameState.GAME_RUNNING:
      handleGameMouseUpOut(evt, forced);
      break;
    default:
    // Optionally handle other game states or do nothing
  }
}
General handler for mouse up events.
Delegates to handleGameMouseUpOut when the game is running.
handleGameMouseUpOut(evt, forced = false)

javascript
Copy code
function handleGameMouseUpOut(evt, forced = false) {
  if (isMouseDown) {
    const mousePos = getMousePos(evt || lastMouseEvent);
    const gameWorldPos = canvasToGameWorld(mousePos.x, mousePos.y);

    // Emit mouseUp event to the server
    socket.emit("mouseUp", {
      x: gameWorldPos.x,
      y: gameWorldPos.y,
      actionMode: actionMode,
      powerLevel: powerLevel,
      forced: forced,
    });

    stopPowerIncrement();

    // Additional logic for wobble (omitted for brevity)

    isMouseDown = false; // Mouse is no longer held down
  }
}
Handles mouse up events during the game.
Sends mouseUp event to the server with mouse coordinates, action mode, powerLevel, and forced flag.
Stops the power increment process.
Event Listeners:
Mouse Events on Canvas:
javascript
Copy code
drawCanvas.addEventListener("mousedown", handleMouseDown, false);
drawCanvas.addEventListener("mousemove", handleMouseMove, false);
drawCanvas.addEventListener("mouseup", handleMouseUpOut, false);
Attach event listeners for mouse actions on the game canvas.
Delegate to the appropriate handlers.
Socket Event Handlers:
socket.on("validClick", ...)

javascript
Copy code
socket.on("validClick", () => {
  isMouseDown = true;
  startPowerIncrement();
});
Server notifies the client that the click is valid.
Starts the power increment process.
socket.on("invalidClick", ...)

javascript
Copy code
socket.on("invalidClick", () => {
  // Click was not on a valid tank
  // Optionally notify the player
});
Server notifies the client that the click is invalid.
Can be used to display an error message or take corrective action.
Socket Emissions:
Mouse Down Event:

javascript
Copy code
socket.emit("mouseDown", {
  x: gameWorldPos.x,
  y: gameWorldPos.y,
  button: evt.button,
  actionMode: actionMode,
});
Sent when the player presses the mouse button down.
Includes the game world coordinates and the current action mode.
Mouse Move Event:

javascript
Copy code
socket.emit("mouseMove", {
  x: gameWorldPos.x,
  y: gameWorldPos.y,
});
Sent when the player moves the mouse while the button is pressed.
Includes the current game world coordinates.
Mouse Up Event:

javascript
Copy code
socket.emit("mouseUp", {
  x: gameWorldPos.x,
  y: gameWorldPos.y,
  actionMode: actionMode,
  powerLevel: powerLevel,
  forced: forced,
});
Sent when the player releases the mouse button or when the power level reaches 100%.
Includes the final game world coordinates, action mode, powerLevel, and whether it was a forced release.
How They Work Together
Mouse Down:

When the player presses the mouse button, handleMouseDown is called.
It delegates to handleGameMouseDown during the game.
handleGameMouseDown emits a mouseDown event to the server with the mouse position and action mode.
The server validates the click and responds with validClick or invalidClick.
Valid Click:

On receiving validClick, the client sets isMouseDown = true and calls startPowerIncrement().
This starts the power increment process, visually updating the power meter.
Mouse Move:

While the mouse button is pressed, moving the mouse triggers handleMouseMove.
It delegates to handleGameMouseMove, which emits mouseMove events to the server with the current position.
Power Increment:

incrementPower() is called recursively via requestAnimationFrame.
It calculates powerLevel based on the elapsed time and updates powerMeterFill.
If powerLevel reaches 100%, it forces a mouse up event by calling handleGameMouseUpOut(null, true).
Mouse Up:

Releasing the mouse button calls handleMouseUpOut, which delegates to handleGameMouseUpOut.
This function emits a mouseUp event to the server with the final position, powerLevel, and whether it was forced.
It also calls stopPowerIncrement() to reset the power meter.
Server Communication:

The server processes mouseDown, mouseMove, and mouseUp events, handling game logic like movement or shooting.
It may respond with additional events or updates to the client.
UI Elements
Power Meter Fill Element:
javascript
Copy code
const powerMeterFill = document.getElementById("powerMeterFill");
The visual representation of the power meter on the client side.
Its height is adjusted in incrementPower() to reflect the current powerLevel.

Variables
Power Level Variables:
POWER_INCREMENT_INTERVAL (const POWER_INCREMENT_INTERVAL = 5;)
The time interval (in milliseconds) at which the power level would increment. Although in this code, the power level increment seems to be handled on the client side, this constant might be a remnant or intended for future use.
POWER_INCREMENT_VALUE (const POWER_INCREMENT_VALUE = 1;)
The amount by which the power level increments at each interval.
MAX_POWER_LEVEL (const MAX_POWER_LEVEL = 100;)
The maximum value the power level can reach.
Minimum Threshold Variables:
minimumDragDistance (const minimumDragDistance = 10;)
The minimum distance (in game units) the player must drag the mouse for an action to be considered valid. Helps prevent accidental or negligible movements.
minimumInitialVelocity (const minimumInitialVelocity = 7.5;)
The minimum initial velocity required for a shell when fired. Ensures that shells have sufficient speed to prevent them from immediately colliding with the firing unit.
Game Timing Variables:
FPS (const FPS = 60;)
Frames per second for the physics engine updates.
deltaTime (const deltaTime = 1000 / FPS;)
Time per frame in milliseconds; used for physics engine update intervals.
Functions
Power Level Calculation:
calculateForceFromPowerLevel(powerLevel, isForced = false)
javascript
Copy code
function calculateForceFromPowerLevel(powerLevel, isForced = false) {
  const forceMultiplier = 0.05; // Base force multiplier
  let force = powerLevel * forceMultiplier; // Base force calculation

  let modifier = 0; // Initialize modifier

  // **Reward Zone: 85-94%**
  if (powerLevel >= 85 && powerLevel < 95) {
    const rewardPoints = powerLevel - 84; // 1 at 85%, 2 at 86%, ..., 10 at 94%
    modifier += rewardPoints * 0.03; // 3% per point
  }

  // **Punishment Zone: 95-99%**
  if (powerLevel >= 95 && powerLevel < 100) {
    const punishmentPoints = powerLevel - 94; // 1 at 95%, ..., 5 at 99%
    modifier -= punishmentPoints * 0.03; // -3% per point
  }

  // **At 100% Power (Forced Action)**
  if (powerLevel === 100 && isForced) {
    modifier -= 0.25; // -25%
  }

  // **Final Force Calculation with Modifiers**
  const finalForce = force * (1 + modifier);

  // **Ensure Force is Non-Negative**
  return Math.max(finalForce, 0);
}
Calculates the force to be applied based on the powerLevel and whether the action was forced.
Includes reward and punishment zones to encourage skillful timing.
Ensures that the final force is non-negative.
Vector Calculation:
calculateVector(start, end)
javascript
Copy code
function calculateVector(start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return { x: deltaX / length, y: deltaY / length };
}
Calculates a normalized vector from the start point to the end point.
Returns an object with x and y components representing the direction.
Force Application:
applyForceToTank(tank, vector, forceMagnitude, roomWorld)

javascript
Copy code
function applyForceToTank(tank, vector, forceMagnitude, roomWorld) {
  tank.isActive = true;

  releaseTank(tank, roomWorld);

  // Apply force in the opposite direction of the vector
  const force = {
    x: -vector.x * forceMagnitude * 2,
    y: -vector.y * forceMagnitude * 2,
  };

  Matter.Body.applyForce(tank, tank.position, force);
}
Applies a calculated force to the tank in the direction opposite to the input vector.
Sets the tank as active, releases any constraints, and uses Matter.js to apply the force.
createAndLaunchShell(unit, vector, forceMagnitude, room)

javascript
Copy code
function createAndLaunchShell(unit, vector, forceMagnitude, room) {
  const shellSize = 5; // Adjust as needed
  const unitSize = unit.size || Math.max(unit.width, unit.height);
  const shellOffset = unitSize / 2 + shellSize / 2 + 1; // Added 1 unit to ensure separation

  // **Invert the vector for opposite direction**
  const invertedVector = {
    x: -vector.x,
    y: -vector.y,
  };

  // Position the shell slightly behind the unit relative to launch direction
  const shellPosition = {
    x: unit.position.x + invertedVector.x * shellOffset,
    y: unit.position.y + invertedVector.y * shellOffset,
  };

  // Calculate initial velocity based on the force magnitude and inverted vector
  let initialVelocity = {
    x: invertedVector.x * forceMagnitude * 7, // Adjust the multiplier as needed
    y: invertedVector.y * forceMagnitude * 7,
  };

  // Ensure the initial velocity meets the minimum requirement
  const velocityMagnitude = Math.hypot(initialVelocity.x, initialVelocity.y);
  if (velocityMagnitude < minimumInitialVelocity) {
    // Normalize the inverted vector and apply minimum velocity
    const normalizedVector = {
      x: invertedVector.x / Math.hypot(invertedVector.x, invertedVector.y),
      y: invertedVector.y / Math.hypot(invertedVector.x, invertedVector.y),
    };
    initialVelocity = {
      x: normalizedVector.x * minimumInitialVelocity,
      y: normalizedVector.y * minimumInitialVelocity,
    };
  }

  const playerId = unit.playerId;

  const shell = ShellModule.createShell(
    shellPosition.x,
    shellPosition.y,
    shellSize,
    initialVelocity,
    playerId,
    unitSize // Pass unitSize if needed
  );
  shell.localId = generateUniqueId(); // Ensure each shell has a unique ID
  room.shells.push(shell);
  Matter.World.add(room.roomWorld, shell);
}
Creates a new shell object and launches it with an initial velocity based on the forceMagnitude and vector.
Ensures the shell starts from a position offset from the unit to prevent immediate collision.
Adjusts the initial velocity to meet the minimum required speed.
Mouse Event Handlers:
socket.on('mouseDown', ...)

javascript
Copy code
socket.on("mouseDown", (data) => {
  // ... (event handler code)

  if (actionMode === "move") {
    const tank = validateClickOnTank(room, localPlayerNumber, x, y);
    if (tank) {
      socket.mouseDownData = {
        startTime: Date.now(),
        startPosition: { x, y },
        tankId: tank.id,
        actionMode: actionMode,
      };
      socket.emit("validClick");
    } else {
      socket.emit("invalidClick");
    }
  } else if (actionMode === "shoot") {
    const unit = validateClickOnShootingUnit(room, localPlayerNumber, x, y);
    if (unit) {
      socket.mouseDownData = {
        startTime: Date.now(),
        startPosition: { x, y },
        unitId: unit.id,
        actionMode: actionMode,
      };
      socket.emit("validClick");
    } else {
      socket.emit("invalidClick");
    }
  } else {
    socket.emit("invalidActionMode");
  }
});
Handles the 'mouseDown' event from the client.
Validates the click based on the actionMode (move or shoot) and stores relevant data in socket.mouseDownData.
Sends back a 'validClick' or 'invalidClick' event to the client.
socket.on('mouseMove', ...)

javascript
Copy code
socket.on("mouseMove", (data) => {
  if (socket.mouseDownData) {
    // Update the endPosition with the latest mouse coordinates
    socket.mouseDownData.endPosition = { x: data.x, y: data.y };
  }
});
Updates the endPosition in socket.mouseDownData with the latest mouse coordinates while the mouse is down.
socket.on('mouseUp', ...)

javascript
Copy code
socket.on("mouseUp", (data) => {
  const isForced = data.forced === true;
  processMouseUp(socket, data, isForced);
});
Handles the 'mouseUp' event from the client.
Calls processMouseUp to apply the action based on the collected data.
Mouse Up Processing:
processMouseUp(socket, data, isForced = false)
javascript
Copy code
function processMouseUp(socket, data, isForced = false) {
  const roomID = socket.roomID;
  const localPlayerNumber = socket.localPlayerNumber;

  if (roomID && localPlayerNumber) {
    const room = gameRooms[roomID];

    if (room) {
      const mouseDownData = socket.mouseDownData || {};

      if (!mouseDownData.startPosition) {
        mouseDownData.startPosition = data.startPosition || { x: data.x, y: data.y };
      }

      if (!mouseDownData.actionMode) {
        mouseDownData.actionMode = data.actionMode;
      }

      const { startPosition, tankId, unitId, actionMode } = mouseDownData;
      const elapsedTime = Date.now() - mouseDownData.startTime;
      const powerDuration = 650; // Duration to reach 100%

      let finalPowerLevel = (elapsedTime / powerDuration) * 100;
      finalPowerLevel = Math.min(finalPowerLevel, 100);

      // Determine if action was forced
      isForced = finalPowerLevel >= 100;

      // Now calculate the force based on the finalPowerLevel and whether the action was forced
      const force = calculateForceFromPowerLevel(finalPowerLevel, isForced);

      // Calculate the vector for force application
      const vector = calculateVector(startPosition, data);

      if (actionMode === "move") {
        const tank = room.tanks.find((t) => t.id === tankId);
        if (tank) {
          // Apply force to the tank
          applyForceToTank(tank, vector, force, room.roomWorld);
        }
      } else if (actionMode === "shoot") {
        const unit = room.tanks.find((t) => t.id === unitId) || room.turrets.find((t) => t.id === unitId);
        if (unit) {
          createAndLaunchShell(unit, vector, force, room);
        } else {
          socket.emit("invalidClick");
        }
      }

      // Clean up mouseDownData
      delete socket.mouseDownData;

      // Emit 'powerCapped' if the action was forced
      if (isForced) {
        socket.emit("powerCapped", { powerLevel: finalPowerLevel });
      }

      // Switch turn to the other player
      room.currentTurn = room.currentTurn === PLAYER_ONE ? PLAYER_TWO : PLAYER_ONE;

      // Notify both players about the turn change
      io.to(room.roomID).emit("turnChanged", { currentTurn: room.currentTurn });

      // Start turn timer for the next player
      startTurnTimer(room);
    }
  }
}
Processes the action when the mouse button is released.
Calculates the finalPowerLevel based on the time the mouse was held down.
Determines if the action was forced due to reaching maximum power level.
Calculates the force to apply using calculateForceFromPowerLevel.
Depending on the actionMode, applies force to the tank or creates and launches a shell.
Switches the turn to the other player and starts the next turn timer.
Helper Functions:
validateClickOnTank(room, localPlayerNumber, x, y)

javascript
Copy code
function validateClickOnTank(room, localPlayerNumber, x, y) {
  const playerTanks = room.tanks.filter((tank) => tank.playerId === localPlayerNumber);

  for (const tank of playerTanks) {
    if (isPointInBody(tank, { x, y })) {
      return tank;
    }
  }
  return null;
}
Validates if the player's click was on one of their own tanks.
Returns the tank object if valid, otherwise returns null.
validateClickOnShootingUnit(room, localPlayerNumber, x, y)

javascript
Copy code
function validateClickOnShootingUnit(room, localPlayerNumber, x, y) {
  const shootingUnits = [...room.tanks, ...room.turrets].filter((unit) => unit.playerId === localPlayerNumber);
  for (const unit of shootingUnits) {
    if (isPointInBody(unit, { x, y })) {
      return unit;
    }
  }
  return null;
}
Validates if the player's click was on a unit capable of shooting (tanks or turrets).
Returns the unit object if valid, otherwise returns null.
isPointInBody(body, point)

javascript
Copy code
function isPointInBody(body, point) {
  return Matter.Bounds.contains(body.bounds, point) && Matter.Vertices.contains(body.vertices, point);
}
Checks if a given point is within the bounds and vertices of a Matter.js body.
releaseTank(tank, roomWorld)

javascript
Copy code
function releaseTank(tank, roomWorld) {
  if (tank.fixedConstraint) {
    World.remove(roomWorld, tank.fixedConstraint);
    tank.fixedConstraint = null;
  }
}
Removes any fixed constraint on the tank, allowing it to move.
fixTankPosition(tank, roomWorld)

javascript
Copy code
function fixTankPosition(tank, roomWorld) {
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
    World.add(roomWorld, tank.fixedConstraint);
  }
}
Fixes the tank's position by adding a constraint, preventing it from moving.
isResting(body, threshold = 0.1)

javascript
Copy code
function isResting(body, threshold = 0.1) {
  const velocityMagnitude = Math.hypot(body.velocity.x, body.velocity.y);
  return velocityMagnitude < threshold;
}
Checks if a body (tank or shell) is at rest by comparing its velocity to a threshold.
How They Work Together
Mouse Down Event:

When the player presses the mouse button, the client sends a 'mouseDown' event to the server.
The server's socket.on('mouseDown', ...) handler processes the event.
Validates the click based on the action mode (move or shoot).
Stores the starting position, time, and relevant unit ID in socket.mouseDownData.
Mouse Move Event:

As the player moves the mouse with the button held down, the client sends 'mouseMove' events.
The server updates socket.mouseDownData.endPosition with the latest coordinates.
Mouse Up Event:

When the player releases the mouse button, the client sends a 'mouseUp' event.
The server's socket.on('mouseUp', ...) handler calls processMouseUp.
Calculates the elapsed time to determine finalPowerLevel.
Uses calculateForceFromPowerLevel to compute the force to apply.
Determines the action (move or shoot) and applies the force accordingly using applyForceToTank or createAndLaunchShell.
Switches the turn to the other player and starts the turn timer.
Force Application:

For movement, the force is applied to the tank in the direction opposite to the drag.
For shooting, a shell is created and launched in the direction opposite to the drag.
Vector and Force Calculations:

calculateVector computes the direction of the action based on the drag.
calculateForceFromPowerLevel adjusts the force based on the power level and whether the action was forced.
Turn Management:

After each action, the turn switches to the other player.
A Timer instance manages the turn duration.
Additional Context
Reward and Punishment Zones:

The calculateForceFromPowerLevel function includes logic to encourage players to release the mouse button within an optimal power range (85-94%).
Going beyond 95% starts to penalize the player, and reaching 100% (forced action) results in a significant penalty.
Forced Actions:

If the player holds the mouse button until the power level reaches 100%, the action is forced.
Forced actions apply a penalty to the force applied, encouraging timely releases.
Constraints and Physics:

Tanks are fixed in position when not moving to prevent unintended drift.
Constraints are added or removed using fixTankPosition and releaseTank.
Shell Management:

Shells are added to the physics world and managed within the room's shells array.
The isResting function helps determine when to remove shells that have come to rest.
Server-Side Validation:

The server performs validation checks to ensure the actions are legitimate.
Validates clicks on tanks or shooting units to prevent cheating.
Inter-Client Communication:

The server uses Socket.IO to emit events to clients, updating them on game state changes, explosions, and other players' actions.
Summary
By isolating these variables and functions, we've identified all components in the server code that handle power levels, force application to tanks and shells, and vector calculations. These elements work together to process player actions, apply physics-based movements, and manage game turns. The server ensures fair play by validating actions and maintaining consistent game logic across all clients.