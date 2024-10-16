// index.js

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Store connected players
let players = {};

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

    // If two players are connected, start the game
    if (players.player1 && players.player2) {
      io.emit("startGame", { players: players });
    }

    socket.on("applyForce", (force) => {
      // Determine the target socket to emit the force
      if (socket.id === players.player1 && players.player2) {
        io.to(players.player2).emit("applyForce", force);
      } else if (socket.id === players.player2 && players.player1) {
        io.to(players.player1).emit("applyForce", force);
      }
    });
  });

  // Handle disconnections
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (players.player1 === socket.id) {
      delete players.player1;
      io.emit("playerDisconnected", 1);
    } else if (players.player2 === socket.id) {
      delete players.player2;
      io.emit("playerDisconnected", 2);
    }
  });

  // You can handle more events like game updates here
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
