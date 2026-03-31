const {
  TIME_COMPRESSION,
  calculateFare,
  calculateMilesForDuration,
  pickRideDurationSeconds,
  randomBetween,
} = require('./playerState');
const { getAggregateStats } = require('./roomManager');

const DESTINATIONS = [
  'Downtown loop',
  'Airport frontage road',
  'Warehouse district',
  'Medical center',
  'Outer ring apartments',
  'Transit hub',
  'Stadium edge',
  'University blocks',
  'Nightlife corridor',
  'Suburban retail strip',
];

const WAITING_STATES = new Set(['idle', 'request_pending', 'deactivated']);
const DRIVING_STATES = new Set(['on_trip']);
const playerTimers = new Map();

function roundCurrency(value) {
  return parseFloat(value.toFixed(2));
}

function roundSeconds(value) {
  return parseFloat(value.toFixed(1));
}

function markMechanic(player, mechanicKey) {
  if (!player.mechanicsSeen.includes(mechanicKey)) {
    player.mechanicsSeen.push(mechanicKey);
  }
}

function getProjectedSimTotals(player, now = Date.now()) {
  let driveSeconds = player.simulatedDriveSeconds || 0;
  let waitSeconds = player.simulatedWaitSeconds || 0;

  if (!player.simStateStartedAt) {
    return { driveSeconds, waitSeconds };
  }

  const elapsedRealSeconds = Math.max(0, (now - player.simStateStartedAt) / 1000);
  const simulatedDelta = elapsedRealSeconds * TIME_COMPRESSION;

  if (DRIVING_STATES.has(player.engagementState)) {
    driveSeconds += simulatedDelta;
  } else if (WAITING_STATES.has(player.engagementState)) {
    waitSeconds += simulatedDelta;
  }

  return {
    driveSeconds: roundSeconds(driveSeconds),
    waitSeconds: roundSeconds(waitSeconds),
  };
}

function calculateEffectiveHourlyRate(player, now = Date.now()) {
  const { driveSeconds, waitSeconds } = getProjectedSimTotals(player, now);
  const totalSimulatedSeconds = driveSeconds + waitSeconds;
  if (totalSimulatedSeconds <= 0) return 0;
  return roundCurrency((player.earnings / totalSimulatedSeconds) * 3600);
}

function syncSimulatedTime(player, now = Date.now()) {
  const { driveSeconds, waitSeconds } = getProjectedSimTotals(player, now);
  player.simulatedDriveSeconds = driveSeconds;
  player.simulatedWaitSeconds = waitSeconds;
  player.simStateStartedAt = now;
  player.effectiveHourlyRate = calculateEffectiveHourlyRate(player, now);
}

function setEngagementState(player, state, now = Date.now()) {
  if (player.simStateStartedAt) {
    syncSimulatedTime(player, now);
  } else {
    player.simStateStartedAt = now;
  }
  player.engagementState = state;
  player.effectiveHourlyRate = calculateEffectiveHourlyRate(player, now);
}

function clearPayInfoPrompt(player) {
  player.showPayInfoPrompt = false;
}

function clearRideState(player) {
  player.pendingRequest = null;
  player.currentTrip = null;
}

function finalizeQuest(player, completed = false) {
  if (!player.quest) return;

  player.questHistory.push({
    ridesRequired: player.quest.ridesRequired,
    ridesCompleted: player.quest.ridesCompleted,
    bonus: player.quest.bonus,
    bonusPaid: completed ? player.quest.bonus : 0,
    hiddenReductionTotal: roundCurrency(player.quest.hiddenReductionTotal || 0),
    fareReductionMultiplier: player.quest.fareReductionMultiplier,
    completed,
  });

  player.quest = null;
}

function ensureQuestStatus(player, now = Date.now()) {
  if (!player.quest?.accepted || !player.quest.active) return;
  if (now <= player.quest.expiresAt) return;
  player.quest.active = false;
  finalizeQuest(player, false);
}

function createRideProfile(player) {
  const durationSeconds = pickRideDurationSeconds();
  const simulatedMiles = calculateMilesForDuration(durationSeconds);
  const baseFare = calculateFare(player, { durationSeconds, simulatedMiles });
  let fare = baseFare;
  let fareReduction = 0;

  if (player.quest?.accepted && player.quest.active) {
    const multiplier = player.quest.fareReductionMultiplier || 0.83;
    fare = roundCurrency(baseFare * multiplier);
    fareReduction = roundCurrency(baseFare - fare);
  }

  if (player.drought) {
    fare = roundCurrency(fare * 0.9);
  }

  const durationMinutes = Math.max(4, Math.round(durationSeconds / 60));
  return {
    durationSeconds,
    simulatedMiles,
    fare,
    baseFare,
    fareReduction,
    destination: `${DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)]}`,
    distanceLabel: `${simulatedMiles.toFixed(1)} mi`,
    durationLabel: `${durationMinutes} min trip`,
  };
}

function getWaitTime(player) {
  const baseWait = randomBetween(5000, 15000);
  const varianceModifier = Math.max(0.8, 1.2 - ((player.fareVariance - 1) * 0.5));
  const droughtModifier = player.drought ? 1.8 : 1;
  const penaltyModifier = player.suppressedUntil > Date.now() ? 2.2 : 1;
  return Math.floor(baseWait * varianceModifier * droughtModifier * penaltyModifier);
}

function getRequestTimeout() {
  return Math.floor(randomBetween(5000, 7000));
}

function sanitizePlayer(socketId, player) {
  ensureQuestStatus(player);

  return {
    socketId,
    name: player.name,
    earnings: player.earnings,
    rating: player.rating,
    ratingCount: player.ratingCount,
    strainLevel: player.strainLevel,
    acceptanceRate: player.acceptanceRate,
    isDeactivated: player.isDeactivated,
    ridesCompleted: player.ridesCompleted || 0,
    consecutiveMisses: player.consecutiveMisses || 0,
    effectiveHourlyRate: calculateEffectiveHourlyRate(player),
    quest: player.quest
      ? {
          accepted: !!player.quest.accepted,
          active: !!player.quest.active,
          ridesRequired: player.quest.ridesRequired,
          ridesCompleted: player.quest.ridesCompleted,
          bonus: player.quest.bonus,
        }
      : null,
  };
}

function getPublicPlayerState(player, now = Date.now()) {
  ensureQuestStatus(player, now);
  syncSimulatedTime(player, now);

  return {
    ...player,
    effectiveHourlyRate: calculateEffectiveHourlyRate(player, now),
  };
}

function emitPlayerState(io, socketId, player) {
  io.to(socketId).emit('player:state_update', getPublicPlayerState(player));
}

function pushHostUpdates(io, room) {
  if (!room.hostSocketId) return;
  io.to(room.hostSocketId).emit('host:aggregate_update', getAggregateStats(room));
  io.to(room.hostSocketId).emit('host:player_update', {
    players: Array.from(room.players.entries()).map(([socketId, player]) => sanitizePlayer(socketId, player)),
  });
}

function clearExpiryTimer(socketId) {
  const timers = playerTimers.get(socketId);
  if (timers?.expiryTimer) {
    clearTimeout(timers.expiryTimer);
    timers.expiryTimer = null;
  }
}

function stopRideLoop(socketId) {
  const timers = playerTimers.get(socketId);
  if (!timers) return;
  if (timers.requestTimer) clearTimeout(timers.requestTimer);
  if (timers.tripTimer) clearTimeout(timers.tripTimer);
  if (timers.expiryTimer) clearTimeout(timers.expiryTimer);
  playerTimers.delete(socketId);
}

function stopAllRideLoops(room) {
  for (const socketId of room.players.keys()) {
    stopRideLoop(socketId);
  }
}

function freezePlayer(io, socketId, player, state = 'paused', now = Date.now()) {
  stopRideLoop(socketId);
  clearRideState(player);
  syncSimulatedTime(player, now);
  player.engagementState = state;
  player.simStateStartedAt = now;
  player.effectiveHourlyRate = calculateEffectiveHourlyRate(player, now);
  emitPlayerState(io, socketId, player);
}

function freezeAllPlayers(io, room, state = 'paused', now = Date.now()) {
  for (const [socketId, player] of room.players.entries()) {
    freezePlayer(io, socketId, player, state, now);
  }
}

function startRideLoop(io, room, socketId) {
  const player = room.players.get(socketId);
  if (!player || player.isDeactivated) return;
  if (room.phase !== 'running' && room.phase !== 'event') return;

  ensureQuestStatus(player);
  stopRideLoop(socketId);

  const now = Date.now();
  setEngagementState(player, 'idle', now);

  const waitTime = getWaitTime(player);
  io.to(socketId).emit('ride:waiting', {
    estimatedWait: waitTime,
    effectiveHourlyRate: calculateEffectiveHourlyRate(player, now),
  });
  emitPlayerState(io, socketId, player);

  const requestTimer = setTimeout(() => {
    if (room.phase !== 'running' && room.phase !== 'event') return;
    if (player.isDeactivated) return;
    sendRideRequest(io, room, socketId);
  }, waitTime);

  playerTimers.set(socketId, { requestTimer, tripTimer: null, expiryTimer: null });
}

function sendRideRequest(io, room, socketId) {
  const player = room.players.get(socketId);
  if (!player || player.isDeactivated) return;

  ensureQuestStatus(player);

  const timeout = getRequestTimeout();
  const requestId = `${socketId}-${Date.now()}`;
  const ride = createRideProfile(player);
  const now = Date.now();

  player.pendingRequest = {
    requestId,
    timeout,
    sentAt: now,
    ...ride,
  };
  player.lastRequestTime = now;
  setEngagementState(player, 'request_pending', now);
  emitPlayerState(io, socketId, player);

  io.to(socketId).emit('ride:request', {
    requestId,
    fare: ride.fare,
    destination: ride.destination,
    distance: ride.distanceLabel,
    timeout,
    durationSeconds: ride.durationSeconds,
  });

  const expiryTimer = setTimeout(() => {
    if (player.pendingRequest?.requestId === requestId) {
      handleDecline(io, room, socketId, requestId, true);
    }
  }, timeout + 1000);

  const timers = playerTimers.get(socketId) || {};
  timers.expiryTimer = expiryTimer;
  playerTimers.set(socketId, timers);
}

function completeTrip(io, room, socketId, player, trip) {
  const now = Date.now();
  player.currentTrip = null;
  player.pendingRequest = null;

  player.earnings = roundCurrency(player.earnings + trip.fare);
  player.currentFare = trip.fare;
  player.ridesCompleted = (player.ridesCompleted || 0) + 1;
  player.simulatedMiles = roundCurrency((player.simulatedMiles || 0) + trip.simulatedMiles);
  player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(1, 4)));
  player.consecutiveDeclines = 0;
  player.consecutiveMisses = 0;

  if (player.quest?.accepted && player.quest.active) {
    player.quest.ridesCompleted += 1;
    player.quest.hiddenReductionTotal = roundCurrency(
      (player.quest.hiddenReductionTotal || 0) + (trip.fareReduction || 0)
    );
    if (player.quest.ridesCompleted >= player.quest.ridesRequired) {
      player.earnings = roundCurrency(player.earnings + player.quest.bonus);
      finalizeQuest(player, true);
    }
  }

  if (player.ridesCompleted % 3 === 0 && player.lastPayInfoRide !== player.ridesCompleted) {
    player.showPayInfoPrompt = true;
    player.lastPayInfoRide = player.ridesCompleted;
  }

  setEngagementState(player, 'idle', now);
  emitPlayerState(io, socketId, player);
  pushHostUpdates(io, room);

  io.to(socketId).emit('ride:trip_completed', {
    fare: trip.fare,
    ridesCompleted: player.ridesCompleted,
  });

  markMechanic(player, 'forward_dispatch');

  const forwardDispatchTimer = setTimeout(() => {
    if (room.phase !== 'running' && room.phase !== 'event') return;
    if (player.isDeactivated) return;
    sendRideRequest(io, room, socketId);
  }, 450);

  const timers = playerTimers.get(socketId) || {};
  timers.tripTimer = forwardDispatchTimer;
  playerTimers.set(socketId, timers);
}

function handleAccept(io, room, socketId, requestId) {
  const player = room.players.get(socketId);
  if (!player || !player.pendingRequest) return { error: 'No pending request' };
  if (player.pendingRequest.requestId !== requestId) return { error: 'Request expired' };

  const elapsed = Date.now() - player.pendingRequest.sentAt;
  if (elapsed > player.pendingRequest.timeout + 1500) {
    return { error: 'Too late' };
  }

  const trip = { ...player.pendingRequest };
  player.pendingRequest = null;
  player.currentTrip = trip;
  clearExpiryTimer(socketId);

  const now = Date.now();
  setEngagementState(player, 'on_trip', now);
  clearPayInfoPrompt(player);

  const realDurationMs = Math.round((trip.durationSeconds / TIME_COMPRESSION) * 1000);
  io.to(socketId).emit('ride:trip_started', {
    fare: trip.fare,
    destination: trip.destination,
    distance: trip.distanceLabel,
    durationMs: realDurationMs,
    durationSeconds: trip.durationSeconds,
    simulatedMiles: trip.simulatedMiles,
  });

  emitPlayerState(io, socketId, player);
  pushHostUpdates(io, room);

  const tripTimer = setTimeout(() => {
    completeTrip(io, room, socketId, player, trip);
  }, realDurationMs);

  const timers = playerTimers.get(socketId) || {};
  timers.tripTimer = tripTimer;
  playerTimers.set(socketId, timers);

  return { success: true, state: getPublicPlayerState(player) };
}

function handleDecline(io, room, socketId, requestId, wasTimeout = false) {
  const player = room.players.get(socketId);
  if (!player) return { error: 'Player not found' };
  if (!player.pendingRequest || player.pendingRequest.requestId !== requestId) {
    return { error: 'Request expired' };
  }

  player.pendingRequest = null;
  clearExpiryTimer(socketId);

  const penalty = wasTimeout ? Math.floor(randomBetween(2, 4)) : Math.floor(randomBetween(1, 3));
  player.acceptanceRate = Math.max(0, player.acceptanceRate - penalty);
  player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(4, 8)));
  player.consecutiveMisses = (player.consecutiveMisses || 0) + 1;
  player.consecutiveDeclines = (player.consecutiveDeclines || 0) + 1;

  if (wasTimeout) {
    player.strainLevel = Math.min(100, player.strainLevel + 2);
  }

  let selectivityWarning = null;
  if (player.consecutiveDeclines > 3) {
    player.suppressedUntil = Date.now() + 60000;
    player.strainLevel = Math.min(100, player.strainLevel + 6);
    selectivityWarning = 'Your selectivity has been noted. You may receive fewer ride requests in high-demand areas.';
  }

  setEngagementState(player, 'idle', Date.now());
  emitPlayerState(io, socketId, player);
  pushHostUpdates(io, room);

  io.to(socketId).emit('ride:declined', {
    wasTimeout,
    consecutiveMisses: player.consecutiveMisses,
    acceptanceRate: player.acceptanceRate,
    selectivityWarning,
  });

  startRideLoop(io, room, socketId);

  return { success: true, state: getPublicPlayerState(player) };
}

function applyRatingHit(player) {
  const oldRating = player.rating;
  const reviewStars = Math.random() < 0.65 ? 1 : Math.random() < 0.8 ? 2 : 3;
  player.ratingSum = roundCurrency(player.ratingSum + reviewStars);
  player.ratingCount += 1;
  player.rating = roundCurrency(player.ratingSum / player.ratingCount);
  player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(8, 16)));
  markMechanic(player, 'ratings_roulette');
  return { oldRating, newRating: player.rating, reviewStars };
}

function forceDeactivation(io, room, socketId, source = 'host_review') {
  const player = room.players.get(socketId);
  if (!player || player.isDeactivated) return false;

  stopRideLoop(socketId);
  player.pendingRequest = null;
  player.currentTrip = null;
  player.isDeactivated = true;
  player.deactivationReason = source;
  player.strainLevel = Math.min(100, player.strainLevel + 20);
  markMechanic(player, 'deactivation_black_box');
  setEngagementState(player, 'deactivated', Date.now());

  io.to(socketId).emit('game:event', {
    type: 'deactivation_warning',
    lockedOut: true,
    reason: source,
  });
  emitPlayerState(io, socketId, player);
  pushHostUpdates(io, room);
  return true;
}

function liftDeactivation(io, room, socketId) {
  const player = room.players.get(socketId);
  if (!player || !player.isDeactivated) return false;

  player.isDeactivated = false;
  player.deactivationReason = null;
  clearRideState(player);
  setEngagementState(player, 'idle', Date.now());
  emitPlayerState(io, socketId, player);
  pushHostUpdates(io, room);
  startRideLoop(io, room, socketId);
  return true;
}

module.exports = {
  TIME_COMPRESSION,
  applyRatingHit,
  calculateEffectiveHourlyRate,
  emitPlayerState,
  forceDeactivation,
  getPublicPlayerState,
  handleAccept,
  handleDecline,
  freezeAllPlayers,
  freezePlayer,
  liftDeactivation,
  markMechanic,
  pushHostUpdates,
  sanitizePlayer,
  setEngagementState,
  startRideLoop,
  stopAllRideLoops,
  stopRideLoop,
  syncSimulatedTime,
};
