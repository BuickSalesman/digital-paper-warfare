// reactor.js
const Matter = require("matter-js");
const { Bodies } = Matter;

const { CATEGORY_SHELL, CATEGORY_REACTOR } = require("./collisionCategories");

module.exports = {
  createReactor: function (x, y, reactorSize, playerId, localId) {
    const reactor = Bodies.circle(x, y, reactorSize / 2, {
      label: "Reactor",
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
        category: CATEGORY_REACTOR,
        mask: CATEGORY_SHELL,
      },
    });

    reactor.hitPoints = 1;

    // Set explicit size property (diameter)
    reactor.size = reactorSize;

    return reactor;
  },
};
