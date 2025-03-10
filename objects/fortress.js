// fortress.js
const Matter = require("matter-js");
const { Bodies } = Matter;

const { CATEGORY_TANK, CATEGORY_FORTRESS } = require("./collisionCategories");

module.exports = {
  createFortress: function (x, y, fortressWidth, fortressHeight, playerId, localId) {
    const fortress = Bodies.rectangle(x, y, fortressWidth, fortressHeight, {
      label: "Fortress",
      playerId: playerId,
      localId: localId,
      isStatic: true,
      render: {
        fillStyle: "transparent",
        strokeStyle: "black",
        lineWidth: 2,
      },
      collisionFilter: {
        group: 0,
        category: CATEGORY_FORTRESS,
        mask: CATEGORY_TANK,
      },
    });

    // Set explicit width and height properties
    fortress.width = fortressWidth;
    fortress.height = fortressHeight;

    return fortress;
  },
};
