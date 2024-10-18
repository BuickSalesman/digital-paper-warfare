const TurretModule = {
  createTurret: function (x, y, turretSize, playerId) {
    const turret = Matter.Bodies.circle(x, y, turretSize / 2, {
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
