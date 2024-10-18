const FortressModule = {
  createFortress: function (x, y, fortressWidth, fortressHeight, playerId) {
    const fortress = Matter.Bodies.rectangle(x, y, fortressWidth, fortressHeight, {
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
