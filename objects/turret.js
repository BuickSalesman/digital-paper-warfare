// turret.js
const Matter = require("matter-js");
const { Bodies } = Matter;

const { CATEGORY_TANK, CATEGORY_TURRET } = require("./collisionCategories");

module.exports = {
  createTurret: function (x, y, turretSize, playerId, localId) {
    const turret = Bodies.circle(x, y, turretSize / 2, {
      label: "Turret",
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
        category: CATEGORY_TURRET,
        mask: CATEGORY_TANK,
      },
    });

    // Set explicit size property (diameter)
    turret.size = turretSize;

    return turret;
  },
};
