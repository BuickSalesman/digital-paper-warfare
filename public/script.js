// public/script.js

const socket = io();

// DOM Elements
const landingPage = document.getElementById("landing-page");
const joinButton = document.getElementById("join-button");
const statusText = document.getElementById("status");
const gameContainer = document.getElementById("game-container");
const canvas = document.getElementById("game-canvas");

// Player Number
let playerNumber = null;

// Handle Join Button Click
joinButton.addEventListener("click", () => {
  socket.emit("joinGame");
  statusText.textContent = "Waiting for another player...";
  joinButton.disabled = true;
});

// Receive Player Number
socket.on("playerNumber", (number) => {
  playerNumber = number;
  statusText.textContent = `You are Player ${playerNumber}`;
});

// Handle Game Start
socket.on("startGame", (data) => {
  if (playerNumber === 1 || playerNumber === 2) {
    startGame();
  }
});

// Handle Game Full
socket.on("gameFull", () => {
  statusText.textContent = "Game is full. Please try again later.";
  joinButton.disabled = true;
});

// Handle Player Disconnection
socket.on("playerDisconnected", (number) => {
  statusText.textContent = `Player ${number} disconnected. Waiting for a new player...`;
  joinButton.disabled = false;
});

// Function to Start the Game
function startGame() {
  // Hide Landing Page and Show Game Canvas
  landingPage.style.display = "none";
  gameContainer.style.display = "block";

  // Initialize Matter.js
  const { Engine, Render, Runner, Bodies, World, Events } = Matter;

  const engine = Engine.create();
  const world = engine.world;

  const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
      width: 800,
      height: 600,
      wireframes: false,
      background: "#fafafa",
    },
  });

  Render.run(render);
  const runner = Runner.create();
  Runner.run(runner, engine);

  // Add boundaries
  const ground = Bodies.rectangle(400, 590, 810, 60, { isStatic: true });
  const ceiling = Bodies.rectangle(400, 10, 810, 60, { isStatic: true });
  const leftWall = Bodies.rectangle(10, 300, 60, 600, { isStatic: true });
  const rightWall = Bodies.rectangle(790, 300, 60, 600, { isStatic: true });
  World.add(world, [ground, ceiling, leftWall, rightWall]);

  // Add a ball
  const ball = Bodies.circle(400, 300, 30, { restitution: 0.9 });
  World.add(world, ball);

  // Handle user input (simple example: apply force on click)
  canvas.addEventListener("mousedown", (event) => {
    const forceMagnitude = 0.05 * ball.mass;

    // Apply force in a random direction
    const force = {
      x: (Math.random() - 0.5) * forceMagnitude,
      y: (Math.random() - 0.5) * forceMagnitude,
    };

    Matter.Body.applyForce(ball, ball.position, force);

    // Optionally, emit the force to the server to synchronize with the other player
    socket.emit("applyForce", force);
  });

  // Listen for forces from the other player
  socket.on("applyForce", (force) => {
    Matter.Body.applyForce(ball, ball.position, force);
  });

  // You can expand this to handle more game logic and synchronization
}
