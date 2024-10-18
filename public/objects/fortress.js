// fortress.js
const Matter = require("matter-js");
const { Bodies } = Matter;

const { CATEGORY_TANK, CATEGORY_FORTRESS } = require("./collisionCategories");

module.exports = {
  createFortress: function (x, y, fortressWidth, fortressHeight, playerId) {
    const fortress = Bodies.rectangle(x, y, fortressWidth, fortressHeight, {
      label: "Fortress",
      playerId: playerId,
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

    return fortress;
  },
};
