function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function createPlayerState(name) {
  return {
    name,
    earnings: 0,
    strainLevel: 0,
    rating: parseFloat(randomBetween(4.7, 5.0).toFixed(2)),
    acceptanceRate: Math.floor(randomBetween(88, 98)),
    fareVariance: parseFloat(randomBetween(0.6, 1.4).toFixed(2)),
    currentFare: null,
    isDeactivated: false,
    statAnswers: [],
    // Ride engine fields
    gameStartedAt: null,
    lastRequestTime: null,
    pendingRequest: null,
    consecutiveMisses: 0,
    ridesCompleted: 0,
    drought: false,
  };
}

function calculateFare(player) {
  const baseFare = randomBetween(3, 25);
  return parseFloat((baseFare * player.fareVariance).toFixed(2));
}

module.exports = { createPlayerState, calculateFare, randomBetween };
