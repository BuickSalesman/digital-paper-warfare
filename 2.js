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

  // Handle 'startDrawing' event
  socket.on("startDrawing", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const drawingSessionId = data.drawingSessionId;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    // Check if the player has reached the maximum number of shapes
    if (room.shapeCounts[playerNumber] >= 5) {
      // Notify the player that they cannot draw more shapes
      socket.emit("drawingDisabled", {
        message: "You have reached the maximum number of shapes.",
      });
      return;
    }

    // Proceed with initializing the drawing session
    if (!room.drawingSessions) {
      room.drawingSessions = {};
    }

    room.drawingSessions[playerNumber] = {
      id: drawingSessionId,
      totalPixelsDrawn: 0,
      path: [],
      isLegal: true,
    };
  });

  socket.on("drawing", (data) => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const room = gameRooms[roomID];
    console.log(data);
    console.log(socket.id);
    if (!room) {
      return;
    }

    if (room.shapeCounts[playerNumber] >= 5) {
      return;
    }

    const session = room.drawingSessions[playerNumber];
    if (!session) {
      return;
    }

    if (room.currentGameState !== GameState.PRE_GAME) {
      return;
    }

    const { from, to, color, lineWidth } = data;

    // Validate coordinates
    if (!isValidCoordinate(from) || !isValidCoordinate(to)) {
      console.log(`Invalid coordinates received from player ${playerNumber}`);
      return;
    }

    // Validate that drawing is within player's area
    if (!isWithinPlayerArea(from.y, playerNumber, room) || !isWithinPlayerArea(to.y, playerNumber, room)) {
      console.log(`Player ${playerNumber} attempted to draw outside their area.`);
      session.isLegal = false;
      socket.emit("drawingIllegally", {});
      return;
    }

    // Calculate the distance between the two points
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    session.totalPixelsDrawn += distance;

    // Add the line segment to the path
    session.path.push({ from, to, color, lineWidth });

    if (session.totalPixelsDrawn > inkLimit) {
      // Exceeded the limit, erase the drawing session
      socket.to(roomID).emit("drawingMirror", {
        playerNumber,
        drawingSessionId: session.id,
        from: data.from,
        to: data.to,
        color: "#FF0000", // Red color for illegal drawing
        lineWidth: data.lineWidth,
      });
      socket.emit("drawingIllegally", {});
    } else {
      // Forward the drawing data to other clients, including color and lineWidth
      socket.to(roomID).emit("drawingMirror", {
        playerNumber,
        drawingSessionId: session.id,
        from: data.from,
        to: data.to,
        color: data.color,
        lineWidth: data.lineWidth,
      });
    }

    let becameIllegal = false;

    if (session.isLegal) {
      const newLine = [from, to];

      // Check intersection with own shapes
      for (let existingShape of room.allPaths) {
        if (existingShape.playerNumber !== playerNumber) {
          continue;
        }

        const existingSegments = getSegmentsFromPath(existingShape.path);

        for (let segment of existingSegments) {
          if (doLineSegmentsIntersect(newLine[0], newLine[1], segment.from, segment.to)) {
            session.isLegal = false;
            becameIllegal = true;
            console.log(`New line segment intersects with existing shape.`);
            break;
          }
        }
        if (!session.isLegal) {
          break;
        }
      }

      // Check intersection with no-draw zones
      if (session.isLegal) {
        for (let noDrawZone of room.noDrawZones) {
          const noDrawZoneEdges = getEdgesFromCoordinates(noDrawZone.map((point) => [point.x, point.y]));
          for (let edge of noDrawZoneEdges) {
            if (doLineSegmentsIntersect(newLine[0], newLine[1], edge[0], edge[1])) {
              session.isLegal = false;
              becameIllegal = true;
              console.log(`New line segment intersects with no-draw zone.`);
              break;
            }
          }
          if (!session.isLegal) {
            break;
          }
        }
      }

      if (session.isLegal && session.totalPixelsDrawn > inkLimit) {
        session.isLegal = false;
        becameIllegal = true;
      }

      if (becameIllegal) {
        socket.emit("drawingIllegally", {});
      }
    }

    // Send the drawing data to clients with appropriate color
    const segmentColor = session.isLegal ? data.color : "#FF0000";
    socket.to(roomID).emit("drawingMirror", {
      playerNumber,
      drawingSessionId: session.id,
      from: data.from,
      to: data.to,
      color: segmentColor,
      lineWidth: data.lineWidth,
    });
  });

  // Handle 'endDrawing' event
  socket.on("endDrawing", () => {
    const roomID = socket.roomID;
    const playerNumber = socket.playerNumber;
    const room = gameRooms[roomID];
    if (!room) {
      return;
    }

    if (room.shapeCounts[playerNumber] >= 5) {
      return;
    }

    const session = room.drawingSessions[playerNumber];
    if (!session) {
      return;
    }

    const path = session.path;
    if (path.length === 0) {
      return;
    }

    const startingPoint = path[0].from;
    const endingPoint = path[path.length - 1].to;

    // Compute closing distance
    const dx = endingPoint.x - startingPoint.x;
    const dy = endingPoint.y - startingPoint.y;

    if (session.totalPixelsDrawn > inkLimit) {
      // Exceeded pixel limit
      socket.emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      socket.to(roomID).emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      delete room.drawingSessions[playerNumber];
      console.log(`Player ${playerNumber}'s drawing exceeded pixel limit after closing and was erased.`);
      return;
    }

    // Close the shape by adding the closing line
    const closingLine = {
      from: endingPoint,
      to: startingPoint,
      color: "#000000",
      lineWidth: 2,
    };
    session.path.push(closingLine);

    // Convert the new shape to polygon coordinates
    const newShapeCoordinates = buildPolygonCoordinates(session.path);

    let isIllegalShape = false;

    // Existing checks for overlaps or containment with other shapes
    for (let existingShape of room.allPaths) {
      // Skip shapes drawn by the other player
      if (existingShape.playerNumber !== playerNumber) {
        continue;
      }

      const existingShapeCoordinates = buildPolygonCoordinates(existingShape.path);

      if (doPolygonsIntersect(newShapeCoordinates, existingShapeCoordinates)) {
        isIllegalShape = true;
        console.log(`New shape intersects with existing shape drawn by Player ${existingShape.playerNumber}.`);
        break;
      }

      if (isPolygonContained(newShapeCoordinates, existingShapeCoordinates)) {
        isIllegalShape = true;
        console.log(`New shape is contained within an existing shape drawn by Player ${existingShape.playerNumber}.`);
        break;
      }

      if (isPolygonContained(existingShapeCoordinates, newShapeCoordinates)) {
        isIllegalShape = true;
        console.log(`Existing shape drawn by Player ${existingShape.playerNumber} is contained within the new shape.`);
        break;
      }
    }

    // New check for intersection with no-draw zones
    if (!isIllegalShape) {
      for (let noDrawZone of room.noDrawZones) {
        const noDrawZoneCoordinates = noDrawZone.map((point) => [point.x, point.y]);
        // Close the no-draw zone polygon if not already closed
        if (
          noDrawZoneCoordinates[0][0] !== noDrawZoneCoordinates[noDrawZoneCoordinates.length - 1][0] ||
          noDrawZoneCoordinates[0][1] !== noDrawZoneCoordinates[noDrawZoneCoordinates.length - 1][1]
        ) {
          noDrawZoneCoordinates.push(noDrawZoneCoordinates[0]);
        }

        if (doPolygonsIntersect(newShapeCoordinates, noDrawZoneCoordinates)) {
          isIllegalShape = true;
          console.log(`New shape intersects with no-draw zone.`);
          break;
        }
      }
    }

    if (isIllegalShape) {
      // Shape is illegal, erase it
      socket.emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      socket.to(roomID).emit("eraseDrawingSession", { drawingSessionId: session.id, playerNumber });
      delete room.drawingSessions[playerNumber];
      console.log(`Player ${playerNumber}'s drawing was illegal and was erased.`);
    } else {
      // Shape is legal, send 'shapeClosed' event
      io.to(roomID).emit("shapeClosed", {
        playerNumber,
        drawingSessionId: session.id,
        closingLine: closingLine,
      });

      // Add the completed path to allPaths
      room.allPaths.push({
        playerNumber,
        path: session.path,
      });

      createBodiesFromShapes(session.path, room);

      room.shapeCounts[playerNumber] += 1;

      if (room.shapeCounts[playerNumber] >= 5) {
        // Notify the player that they can no longer draw
        const playerSocketId = room.players[`player${playerNumber}`];
        if (playerSocketId) {
          const playerSocket = io.sockets.sockets.get(playerSocketId);
          if (playerSocket) {
            playerSocket.emit("drawingDisabled", {
              message: "You have reached the maximum number of shapes.",
            });
          }
        }
      }

      const shapeLimit = 5;
      if (room.shapeCounts[PLAYER_ONE] >= shapeLimit && room.shapeCounts[PLAYER_TWO] >= shapeLimit) {
        // Both players have reached the limit
        room.currentGameState = GameState.GAME_RUNNING;

        // Notify both clients
        io.to(roomID).emit("gameRunning", {
          message: "Both players have completed their shapes. The game is now running.",
        });
      }

      // Remove the drawing session
      delete room.drawingSessions[playerNumber];
      console.log(`Player ${playerNumber}'s drawing was legal and added to allPaths.`);
    }
  });
});
