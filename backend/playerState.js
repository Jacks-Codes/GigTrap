function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

const TIME_COMPRESSION = 10;

function weightedPick(entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function createMechanicsSeen() {
  return ['algorithmic_wage_suppression'];
}

function createPlayerState(name) {
  const startingRating = parseFloat(randomBetween(4.82, 4.98).toFixed(2));
  return {
    name,
    earnings: 0,
    strainLevel: 0,
    rating: startingRating,
    ratingSum: parseFloat((startingRating * 3).toFixed(2)),
    ratingCount: 3,
    acceptanceRate: Math.floor(randomBetween(88, 98)),
    fareVariance: parseFloat(randomBetween(0.82, 1.18).toFixed(2)),
    currentFare: null,
    isDeactivated: false,
    statAnswers: [],
    gameStartedAt: null,
    lastRequestTime: null,
    pendingRequest: null,
    currentTrip: null,
    consecutiveMisses: 0,
    consecutiveDeclines: 0,
    ridesCompleted: 0,
    drought: false,
    suppressedUntil: 0,
    simulatedDriveSeconds: 0,
    simulatedWaitSeconds: 0,
    simulatedMiles: 0,
    effectiveHourlyRate: 0,
    simClockRate: TIME_COMPRESSION,
    engagementState: 'idle',
    simStateStartedAt: null,
    quest: null,
    questHistory: [],
    mechanicsSeen: createMechanicsSeen(),
    lastPayInfoRide: 0,
    showPayInfoPrompt: false,
    deactivationReason: null,
  };
}

function pickRideDurationSeconds() {
  const bucket = weightedPick([
    { min: 240, max: 360, weight: 1.2 },
    { min: 360, max: 540, weight: 3.5 },
    { min: 540, max: 720, weight: 4.4 },
    { min: 720, max: 900, weight: 2.3 },
    { min: 900, max: 1200, weight: 0.9 },
  ]);
  return Math.round(randomBetween(bucket.min, bucket.max));
}

function calculateMilesForDuration(durationSeconds) {
  const averageSpeed = randomBetween(16, 28);
  const rawMiles = (durationSeconds / 3600) * averageSpeed;
  return parseFloat(Math.max(1.2, rawMiles).toFixed(1));
}

function calculateFare(player, ride) {
  const baseFare = 0.55 + (ride.simulatedMiles * 0.4) + ((ride.durationSeconds / 60) * 0.09);
  const adjustedFare = baseFare * player.fareVariance;
  return parseFloat(Math.max(2.25, adjustedFare).toFixed(2));
}

module.exports = {
  TIME_COMPRESSION,
  createPlayerState,
  calculateFare,
  calculateMilesForDuration,
  pickRideDurationSeconds,
  randomBetween,
};
