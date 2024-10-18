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
