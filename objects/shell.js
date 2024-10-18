// shell.js
const Matter = require("matter-js");
const { Bodies, Body } = Matter;

const { CATEGORY_TANK, CATEGORY_SHELL, CATEGORY_SHAPE, CATEGORY_REACTOR } = require("./collisionCategories");

module.exports = {
  createShell: function (x, y, shellSize, initialVelocity, playerId, tankSize) {
    const area = tankSize * tankSize; // Assuming a square tank
    const desiredMass = 100; // Set your desired mass
    const density = desiredMass / area;

    const shell = Bodies.circle(x, y, shellSize / 2, {
      label: "Shell",
      playerId: playerId,
      restitution: 0.1,
      friction: 1,
      frictionAir: 0.1,
      density: density, // Light weight
      render: {
        fillStyle: "black",
      },
      collisionFilter: {
        group: 0,
        category: CATEGORY_SHELL,
        mask: CATEGORY_TANK | CATEGORY_REACTOR | CATEGORY_SHAPE,
      },
    });

    // Apply initial velocity to the shell
    Body.setVelocity(shell, initialVelocity);

    return shell;
  },
};
