// index.js

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const Matter = require("matter-js");

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Matter.js setup
const Engine = Matter.Engine;
const World = Matter.World;
const Bodies = Matter.Bodies;
const Body = Matter.Body;

// Create a Matter.js engine
const engine = Engine.create();
const world = engine.world;

// Define game boundaries
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

// Players and Balls
let players = {
  player1: null,
  player2: null,
};

let balls = {
  player1: null,
  player2: null,
};

// Function to initialize balls once both players have joined
function initializeBalls() {
  if (players.player1 && players.player2) {
    // Remove existing balls if any
    if (balls.player1) {
      World.remove(world, balls.player1);
    }
    if (balls.player2) {
      World.remove(world, balls.player2);
    }

    // Create Player 1's Ball (Red)
    balls.player1 = Bodies.circle(300, 300, 30, {
      restitution: 0.9,
      label: "player1",
      render: { fillStyle: "#FF0000" },
    });

    // Create Player 2's Ball (Blue)
    balls.player2 = Bodies.circle(500, 300, 30, {
      restitution: 0.9,
      label: "player2",
      render: { fillStyle: "#0000FF" },
    });

    // Add balls to the world
    World.add(world, [balls.player1, balls.player2]);

    console.log("Balls initialized for both players.");
  }
}

// Handle socket connections
io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  // Handle 'joinGame' event
  socket.on("joinGame", () => {
    let playerNumber;
    if (!players.player1) {
      players.player1 = socket.id;
      playerNumber = 1;
    } else if (!players.player2) {
      players.player2 = socket.id;
      playerNumber = 2;
    } else {
      // If both players are already connected
      socket.emit("gameFull");
      return;
    }

    // Assign player number to the socket
    socket.emit("playerNumber", playerNumber);
    console.log(`Socket ${socket.id} joined as Player ${playerNumber}`);

    // Initialize balls if both players have joined
    initializeBalls();

    // If two players are connected, start the game
    if (players.player1 && players.player2) {
      io.emit("startGame", { players: players });
    }
  });

  // Handle 'applyForce' event
  socket.on("applyForce", (data) => {
    const { playerNumber, force } = data;
    console.log(`Player ${playerNumber} applied force:`, force);

    // Apply force to the corresponding ball
    if (playerNumber === 1 && balls.player1) {
      Body.applyForce(balls.player1, balls.player1.position, force);
    } else if (playerNumber === 2 && balls.player2) {
      Body.applyForce(balls.player2, balls.player2.position, force);
    }
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    let disconnectedPlayer = null;

    if (players.player1 === socket.id) {
      disconnectedPlayer = 1;
      players.player1 = null;
      World.remove(world, balls.player1);
      balls.player1 = null;
    } else if (players.player2 === socket.id) {
      disconnectedPlayer = 2;
      players.player2 = null;
      World.remove(world, balls.player2);
      balls.player2 = null;
    }

    if (disconnectedPlayer) {
      io.emit("playerDisconnected", disconnectedPlayer);
      console.log(`Player ${disconnectedPlayer} has disconnected.`);
    }
  });
});

// Run the Matter.js engine manually using setInterval
const FPS = 60;
const deltaTime = 1000 / FPS; // Time per frame in ms

setInterval(() => {
  Engine.update(engine, deltaTime);

  if (players.player1 && players.player2) {
    // Prepare game state
    const gameState = {
      player1: {
        position: {
          x: Math.round(balls.player1.position.x),
          y: Math.round(balls.player1.position.y),
        },
        velocity: {
          x: Math.round(balls.player1.velocity.x * 1000) / 1000,
          y: Math.round(balls.player1.velocity.y * 1000) / 1000,
        },
      },
      player2: {
        position: {
          x: Math.round(balls.player2.position.x),
          y: Math.round(balls.player2.position.y),
        },
        velocity: {
          x: Math.round(balls.player2.velocity.x * 1000) / 1000,
          y: Math.round(balls.player2.velocity.y * 1000) / 1000,
        },
      },
    };

    // Emit the game state to all clients
    io.emit("stateUpdate", gameState);
  }
}, deltaTime);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
