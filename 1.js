io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle 'joinGame' event
  socket.on("joinGame", (data) => {
    console.log(`Received 'joinGame' from socket ${socket.id}`);
    const passcode = data && data.passcode ? data.passcode : null;

    if (passcode) {
      console.log(`Player wants to join room with passcode: ${passcode}`);

      // Validate passcode (ensure it's 6 digits)
      if (!/^[A-Za-z0-9]{6}$/.test(passcode)) {
        console.log(`Invalid passcode: ${passcode}`);
        socket.emit("invalidPasscode", { message: "Passcode must be exactly 6 letters and numbers." });
        return;
      }

      const roomID = `passcode_${passcode}`; // Use passcode as room ID
      let room = gameRooms[roomID];

      if (!room) {
        // No room with this passcode exists, create a new one
        console.log(`Creating new passcode room ${roomID}`);
        createNewRoom(roomID, socket, true);
      } else {
        // Room exists, try to join it
        console.log(`Joining existing passcode room ${roomID}`);
        joinRoom(socket, room);
      }
    } else {
      // Existing logic to join a random available room
      let roomFound = false;

      // Search for a room with less than 2 players and in LOBBY state
      for (const roomID in gameRooms) {
        const room = gameRooms[roomID];
        if (
          !room.isPasscodeRoom &&
          room.currentGameState === GameState.LOBBY &&
          (!room.players.player1 || !room.players.player2)
        ) {
          roomFound = true;
          console.log(`Joining existing room ${roomID}`);
          joinRoom(socket, room);
          break;
        }
      }

      if (!roomFound) {
        // Create a new room
        const newRoomID = `room${nextRoomNumber}`;
        nextRoomNumber += 1;
        console.log(`Creating new room ${newRoomID}`);
        createNewRoom(newRoomID, socket);
      }
    }
  });

  // Handle 'ready' event
  socket.on("ready", () => {
    console.log(`Received 'ready' from socket ${socket.id} in room ${socket.roomID}`);
    const roomID = socket.roomID;
    if (roomID) {
      const room = gameRooms[roomID];
      if (room) {
        room.readyPlayers += 1;
        console.log(`Room ${roomID} has ${room.readyPlayers} ready player(s).`);

        // Check if all players are ready
        const totalPlayers = room.players.player1 && room.players.player2 ? 2 : 1;
        if (room.readyPlayers === totalPlayers) {
          // Transition to PRE_GAME
          room.currentGameState = GameState.PRE_GAME;

          // Emit 'startPreGame' to all clients in the room
          io.to(roomID).emit("startPreGame", {
            message: "Both players are ready. Starting the game...",
          });
        }
      }
    }
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;

    if (roomID && playerNumber) {
      const room = gameRooms[roomID];
      if (room) {
        let disconnectedPlayer = playerNumber;

        if (playerNumber === PLAYER_ONE && room.players.player1 === socket.id) {
          room.players.player1 = null;
          console.log(`Player 1 (${socket.id}) disconnected from ${roomID}`);
        } else if (playerNumber === PLAYER_TWO && room.players.player2 === socket.id) {
          room.players.player2 = null;
          console.log(`Player 2 (${socket.id}) disconnected from ${roomID}`);
        }

        // Reset the playerNumber and roomID of the remaining player
        const remainingPlayerSocketId = room.players.player1 || room.players.player2;
        if (remainingPlayerSocketId) {
          const remainingPlayerSocket = io.sockets.sockets.get(remainingPlayerSocketId);
          if (remainingPlayerSocket) {
            remainingPlayerSocket.playerNumber = null;
            remainingPlayerSocket.roomID = null;
            console.log(`Reset playerNumber and roomID for remaining player ${remainingPlayerSocketId}`);
          }
        }

        // Emit 'playerDisconnected' to all clients in the room
        io.to(roomID).emit("playerDisconnected", disconnectedPlayer);
        console.log(`Notified room ${roomID} about disconnection of Player ${disconnectedPlayer}`);

        // Properly remove all bodies from the Matter.js world
        Matter.World.clear(room.roomWorld, false);
        Matter.Engine.clear(room.roomEngine);

        // Clear the interval
        clearInterval(roomIntervals[roomID]);
        delete roomIntervals[roomID];

        // Clear any active mouseDown timer
        if (socket.mouseDownTimer) {
          clearTimeout(socket.mouseDownTimer);
          delete socket.mouseDownTimer;
          delete socket.mouseDownData;
        }

        // Delete the room completely
        delete gameRooms[roomID];
        console.log(`Room ${roomID} has been deleted due to player disconnection.`);
      }
    }
  });

  // Handle 'mouseDown' event
  socket.on("mouseDown", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const actionMode = data.actionMode;

    if (roomID && playerNumber) {
      const room = gameRooms[roomID];
      if (room) {
        // Prevent multiple mouseDown events without mouseUp
        if (socket.mouseDownData) {
          console.log(`Socket ${socket.id} is already holding mouse down.`);
          return;
        }

        const { x, y } = data;

        if (actionMode === "move") {
          const tank = validateClickOnTank(room, playerNumber, x, y);
          if (tank) {
            socket.mouseDownData = {
              startTime: Date.now(),
              startPosition: { x, y },
              tankId: tank.id,
              actionMode: actionMode,
            };
            socket.emit("validClick");
            console.log(`Player ${playerNumber} started moving tank ${tank.id}`);

            // Start the 1.2-second timer
            socket.mouseDownTimer = setTimeout(() => {
              console.log(`Auto-triggering mouseUp for socket ${socket.id} after 1.2 seconds`);
              processMouseUp(socket, { x, y }, true); // isForced = true
            }, 450);
          } else {
            socket.emit("invalidClick");
          }
        } else if (actionMode === "shoot") {
          const unit = validateClickOnShootingUnit(room, playerNumber, x, y);
          if (unit) {
            socket.mouseDownData = {
              startTime: Date.now(),
              startPosition: { x, y },
              unitId: unit.id,
              actionMode: actionMode,
            };
            socket.emit("validClick");
            console.log(`Player ${playerNumber} started shooting with unit ${unit.id}`);

            // Start the 1.2-second timer
            socket.mouseDownTimer = setTimeout(() => {
              console.log(`Auto-triggering mouseUp for socket ${socket.id} after 1.2 seconds`);
              processMouseUp(socket, { x, y }, true); // isForced = true
            }, 450);
          } else {
            socket.emit("invalidClick");
          }
        } else {
          socket.emit("invalidActionMode");
        }
      }
    }
  });

  // Handle 'mouseUp' event
  socket.on("mouseUp", (data) => {
    console.log(`Received 'mouseUp' from socket ${socket.id}`);
    processMouseUp(socket, data, false); // isForced = false
  });

  socket.on("mouseMove", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;

    if (roomID && playerNumber && socket.mouseDownData) {
      // Update the endPosition with the latest mouse coordinates
      socket.mouseDownData.endPosition = { x: data.x, y: data.y };
    }
  });
});
