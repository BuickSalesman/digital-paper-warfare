// Game Rooms Object
let gameRooms = {};

// Handle socket connections
io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle 'joinGame' event
  socket.on("joinGame", () => {
    let roomFound = false;

    // Search for a room with less than 2 players
    for (const roomID in gameRooms) {
      const room = gameRooms[roomID];

      if (!room.players.player1 || !room.players.player2) {
        // Assign player to this room
        roomFound = true;
        joinRoom(socket, room);
        break;
      }
    }

    if (!roomFound) {
      // Create a new room
      const newRoomID = `room${Object.keys(gameRooms).length + 1}`;
      createNewRoom(newRoomID, socket);
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

        if (playerNumber === 1 && room.players.player1 === socket.id) {
          room.players.player1 = null;
          World.remove(room.world, room.balls.player1);
          room.balls.player1 = null;
        } else if (playerNumber === 2 && room.players.player2 === socket.id) {
          room.players.player2 = null;
          World.remove(room.world, room.balls.player2);
          room.balls.player2 = null;
        }

        io.to(roomID).emit("playerDisconnected", disconnectedPlayer);
        console.log(`Player ${disconnectedPlayer} has disconnected from ${roomID}.`);

        // If both players are disconnected, remove the room
        if (!room.players.player1 && !room.players.player2) {
          delete gameRooms[roomID];
          console.log(`Room ${roomID} has been removed.`);
        }
      }
    }
  });
});

// Function to join an existing room
function joinRoom(socket, room) {
  let playerNumber;
  if (!room.players.player1) {
    room.players.player1 = socket.id;
    playerNumber = 1;
  } else if (!room.players.player2) {
    room.players.player2 = socket.id;
    playerNumber = 2;
  } else {
    // Room is full
    socket.emit("gameFull");
    return; // Exit the function
  }

  socket.join(room.roomID);
  socket.playerNumber = playerNumber;
  socket.roomID = room.roomID;
  socket.emit("playerInfo", { playerNumber, roomID: room.roomID });
  console.log(`Socket ${socket.id} joined ${room.roomID} as Player ${playerNumber}`);

  // If two players are connected, start the game
  if (room.players.player1 && room.players.player2) {
    io.to(room.roomID).emit("startGame", { players: room.players });
  }
}

// Function to create a new room
function createNewRoom(roomID, socket) {
  const engine = Engine.create();
  const world = engine.world;

  // Define boundaries
  const boundaries = [
    // Ground
    Bodies.rectangle(400, 600, 810, 60, { isStatic: true }),
    // Ceiling
    Bodies.rectangle(400, 0, 810, 60, { isStatic: true }),
    // Left Wall
    Bodies.rectangle(0, 300, 60, 600, { isStatic: true }),
    // Right Wall
    Bodies.rectangle(800, 300, 60, 600, { isStatic: true }),
  ];
  // Add boundaries to the world
  World.add(world, boundaries);

  const room = {
    roomID: roomID,
    players: {
      player1: socket.id,
      player2: null,
    },
    // balls: {
    //   player1: null,
    //   player2: null,
    // },
    engine: engine,
    world: world,
  };

  gameRooms[roomID] = room;

  socket.join(roomID);
  socket.playerNumber = 1;
  socket.roomID = roomID;
  socket.emit("playerInfo", { playerNumber: 1, roomID });
  console.log(`Socket ${socket.id} created and joined ${roomID} as Player 1`);

  // Wait for another player to join
}

// Run the Matter.js engines for all rooms
const FPS = 60;
const deltaTime = 1000 / FPS; // Time per frame in ms

setInterval(() => {
  for (const roomID in gameRooms) {
    const room = gameRooms[roomID];
    Engine.update(room.engine, deltaTime);
  }
}, deltaTime);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
