// turret.js
const Matter = require("matter-js");
const { Bodies } = Matter;

const { CATEGORY_TANK, CATEGORY_TURRET } = require("./collisionCategories");

module.exports = {
  createTurret: function (x, y, turretSize, playerId) {
    const turret = Bodies.circle(x, y, turretSize / 2, {
      label: "Turret",
      playerId: playerId,
      isStatic: true,
      render: {
        fillStyle: "transparent",
        strokeStyle: "black",
        lineWidth: 2,
      },
      collisionFilter: {
        group: 0,
        category: CATEGORY_TURRET,
        mask: CATEGORY_TANK,
      },
    });

    return turret;
  },
};
