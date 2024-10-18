//#region VARIABLES

//#region GAME AND PLAYER VARIABLES

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

// Game state setup.
const GameState = Object.freeze({
  PRE_GAME: "PRE_GAME",
  GAME_RUNNING: "GAME_RUNNING",
  POST_GAME: "POST_GAME",
});

let currentGameState = GameState.PRE_GAME;

// Declare player ID's.
const PLAYER_ONE = 1;
const PLAYER_TWO = 2;

//#endregion GAME AND PLAYER VARIABLES

//#region CANVAS AND CONTEXT VARIABLES

// Define acceptable dimension ranges
const MIN_WIDTH = 300;
const MAX_WIDTH = 1920;
const MIN_HEIGHT = 300;
const MAX_HEIGHT = 1080;

//#endregion CANVAS AND CONTEXT VARIABLES

//#region MATTER SETUP VARIABLES

// Import Matter components.
const {
  Body,
  Bodies,
  Bounds,
  Collision,
  Constraint,
  Detector,
  Engine,
  Events,
  Mouse,
  MouseConstraint,
  Render,
  Runner,
  Vertices,
  Vector,
  World,
} = Matter;

// Declare engine.
const engine = Engine.create();

// Declare world.
const world = engine.world;

//#endregion MATTER SETUP VARIABLES

//#endregion VARIABLES

//#region WORLD SETUP

//Disable gravity.
engine.world.gravity.y = 0;
engine.world.gravity.x = 0;

//#region BODY CREATION

//#endregion BODY CREATIONS

//#endregion WORLD SETUP

//#region SOCKET EVENTS
io.on("connection", (socket) => {
  socket.on("clientDimensions", ({ width, height }) => {
    // Validate dimensions
    const validatedWidth = validateDimension(width, MIN_WIDTH, MAX_WIDTH);
    const validatedHeight = validateDimension(height, MIN_HEIGHT, MAX_HEIGHT);

    // Store dimensions in the player's session
    socket.playerWidth = validatedWidth;
    socket.playerHeight = validatedHeight;

    // Define walls using validated dimensions
    const walls = createWalls(validatedWidth, validatedHeight);

    // Add walls to the physics engine
    // (Assuming you have a Matter.js engine on the server)
    World.add(engine.world, walls);

    // Send acknowledgment to the client
    socket.emit("dimensionsConfirmed", { width: validatedWidth, height: validatedHeight });
  });
});
//#endregion SOCKET EVENTS

//#region FUNCTIONS

//#region GAME BOARD FUNCTIONS
function validateDimension(value, min, max) {
  if (typeof value !== "number" || value < min || value > max) {
    // Set to default if invalid
    return (min + max) / 2;
  }
  return value;
}
//#endregion GAME BOARD FUNCTIONS

//#region MATTER BODY FUNTIONS

//#region BODY CREATION FUNCTIONS

function createWalls(width, height) {
  return [
    // Top wall
    Bodies.rectangle(width / 2, -500, width + 1000, 1000, { isStatic: true }),
    // Bottom wall
    Bodies.rectangle(width / 2, height + 500, width + 1000, 1000, { isStatic: true }),
    // Left wall
    Bodies.rectangle(-500, height / 2, 1000, height + 1000, { isStatic: true }),
    // Right wall
    Bodies.rectangle(width + 500, height / 2, 1000, height + 1000, { isStatic: true }),
  ];
}
//#endregion BODY CREATION FUNCTIONS

//#endregion MATTER BODY FUNCTIONS

//#endregion FUNCTIONS
