// Handle State Updates from Server
socket.on("stateUpdate", (state) => {});

// Handle User Input (Mouse Click)
canvas.addEventListener("mousedown", (event) => {
  if (!playerNumber) return;

  // Calculate mouse position relative to the canvas
  const rect = canvas.getBoundingClientRect();
  const mouseX = (event.clientX - rect.left) * (800 / canvas.width);
  const mouseY = (event.clientY - rect.top) * (600 / canvas.height);

  // Emit the force to the server with player number
  // socket.emit("applyForce", { playerNumber, force });
});
