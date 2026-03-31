const { calculateFare, randomBetween } = require('./playerState');
const { getAggregateStats } = require('./roomManager');

// Destination templates — vague on purpose
const DESTINATIONS = [
  { text: '12 min away', distance: '4.2 mi' },
  { text: '8 min away', distance: '2.8 mi' },
  { text: '18 min away', distance: '7.1 mi' },
  { text: '6 min away', distance: '1.9 mi' },
  { text: '25 min away', distance: '11.3 mi' },
  { text: '15 min away', distance: '5.6 mi' },
  { text: '10 min away', distance: '3.4 mi' },
  { text: '22 min away', distance: '9.0 mi' },
];

// Trip durations (ms) — how long the fake trip takes
const TRIP_DURATION_MIN = 6000;
const TRIP_DURATION_MAX = 14000;

// Per-player ride loop timers
const playerTimers = new Map(); // socketId -> { requestTimer, tripTimer }

function getWaitTime(player) {
  // Lucky players (high fareVariance) get requests faster
  // Base wait: 8-20 seconds. fareVariance inverts it — 1.4x variance = shorter wait
  const baseWait = randomBetween(8000, 20000);
  const adjusted = baseWait / player.fareVariance;
  // Drought doubles wait time
  const multiplier = player.drought ? 2.5 : 1;
  return Math.floor(adjusted * multiplier);
}

function getRequestTimeout() {
  // 5-7 seconds, randomized per request
  return Math.floor(randomBetween(5000, 7000));
}

function startRideLoop(io, room, socketId) {
  const player = room.players.get(socketId);
  if (!player || player.isDeactivated) return;
  if (room.phase !== 'running' && room.phase !== 'event') return;

  // Clear any existing timers
  stopRideLoop(socketId);

  const waitTime = getWaitTime(player);

  // Tell the player they're waiting
  io.to(socketId).emit('ride:waiting', {
    estimatedWait: waitTime,
    gameStartedAt: player.gameStartedAt,
  });

  const requestTimer = setTimeout(() => {
    // Room might have changed phase
    if (room.phase !== 'running' && room.phase !== 'event') return;
    if (player.isDeactivated) return;

    sendRideRequest(io, room, socketId);
  }, waitTime);

  playerTimers.set(socketId, { requestTimer, tripTimer: null });
}

function sendRideRequest(io, room, socketId) {
  const player = room.players.get(socketId);
  if (!player || player.isDeactivated) return;

  const fare = calculateFare(player);
  const dest = DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)];
  const timeout = getRequestTimeout();
  const requestId = `${socketId}-${Date.now()}`;

  // Store the pending request on the player
  player.pendingRequest = {
    requestId,
    fare,
    destination: dest,
    timeout,
    sentAt: Date.now(),
  };
  player.lastRequestTime = Date.now();

  io.to(socketId).emit('ride:request', {
    requestId,
    fare,
    destination: dest.text,
    distance: dest.distance,
    timeout,
  });

  // Server-side expiry — if client doesn't respond in time + 1s grace
  const expiryTimer = setTimeout(() => {
    if (player.pendingRequest && player.pendingRequest.requestId === requestId) {
      // Auto-decline: client didn't respond in time
      handleDecline(io, room, socketId, requestId, true);
    }
  }, timeout + 1000);

  const timers = playerTimers.get(socketId) || {};
  timers.expiryTimer = expiryTimer;
  playerTimers.set(socketId, timers);
}

function handleAccept(io, room, socketId, requestId) {
  const player = room.players.get(socketId);
  if (!player || !player.pendingRequest) return { error: 'No pending request' };
  if (player.pendingRequest.requestId !== requestId) return { error: 'Request expired' };

  // Validate timing — did they respond within the timeout window?
  const elapsed = Date.now() - player.pendingRequest.sentAt;
  if (elapsed > player.pendingRequest.timeout + 1500) {
    // Too late even with generous grace period
    return { error: 'Too late' };
  }

  const fare = player.pendingRequest.fare;
  const dest = player.pendingRequest.destination;

  // Clear pending
  player.pendingRequest = null;
  clearExpiryTimer(socketId);

  // Update earnings
  player.earnings = parseFloat((player.earnings + fare).toFixed(2));
  player.currentFare = fare;
  player.consecutiveMisses = 0;
  player.ridesCompleted = (player.ridesCompleted || 0) + 1;
  player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(1, 4)));

  // Trip duration based on "distance"
  const tripDuration = Math.floor(randomBetween(TRIP_DURATION_MIN, TRIP_DURATION_MAX));

  // Tell player they're on a trip
  io.to(socketId).emit('ride:trip_started', {
    fare,
    destination: dest.text,
    distance: dest.distance,
    duration: tripDuration,
  });

  io.to(socketId).emit('player:state_update', { ...player });

  // Update host
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit('host:aggregate_update', getAggregateStats(room));
    io.to(room.hostSocketId).emit('host:player_update', {
      players: Array.from(room.players.values()).map(sanitizePlayer),
    });
  }

  // After trip completes, immediately queue next request (forward dispatch)
  const tripTimer = setTimeout(() => {
    io.to(socketId).emit('ride:trip_completed', { fare });
    // No break — queue immediately
    startRideLoop(io, room, socketId);
  }, tripDuration);

  const timers = playerTimers.get(socketId) || {};
  timers.tripTimer = tripTimer;
  playerTimers.set(socketId, timers);

  return { success: true, fare, state: { ...player } };
}

function handleDecline(io, room, socketId, requestId, wasTimeout = false) {
  const player = room.players.get(socketId);
  if (!player) return { error: 'Player not found' };

  // Only process if this is still the active request
  if (player.pendingRequest && player.pendingRequest.requestId === requestId) {
    player.pendingRequest = null;
    clearExpiryTimer(socketId);

    // Acceptance rate penalty — slightly worse for timeout
    const penalty = wasTimeout ? Math.floor(randomBetween(2, 4)) : Math.floor(randomBetween(1, 3));
    player.acceptanceRate = Math.max(0, player.acceptanceRate - penalty);

    // Strain ticks up more on decline
    player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(3, 7)));

    // Track consecutive misses
    player.consecutiveMisses = (player.consecutiveMisses || 0) + 1;

    io.to(socketId).emit('ride:declined', {
      wasTimeout,
      consecutiveMisses: player.consecutiveMisses,
      acceptanceRate: player.acceptanceRate,
    });

    io.to(socketId).emit('player:state_update', { ...player });

    // Update host
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('host:aggregate_update', getAggregateStats(room));
      io.to(room.hostSocketId).emit('host:player_update', {
        players: Array.from(room.players.values()).map(sanitizePlayer),
      });
    }

    // Queue next request after a short delay
    startRideLoop(io, room, socketId);
  }

  return { success: true, state: player ? { ...player } : null };
}

function clearExpiryTimer(socketId) {
  const timers = playerTimers.get(socketId);
  if (timers && timers.expiryTimer) {
    clearTimeout(timers.expiryTimer);
    timers.expiryTimer = null;
  }
}

function stopRideLoop(socketId) {
  const timers = playerTimers.get(socketId);
  if (timers) {
    if (timers.requestTimer) clearTimeout(timers.requestTimer);
    if (timers.tripTimer) clearTimeout(timers.tripTimer);
    if (timers.expiryTimer) clearTimeout(timers.expiryTimer);
    playerTimers.delete(socketId);
  }
}

function stopAllRideLoops(room) {
  for (const socketId of room.players.keys()) {
    stopRideLoop(socketId);
  }
}

function sanitizePlayer(p) {
  return {
    name: p.name,
    earnings: p.earnings,
    rating: p.rating,
    strainLevel: p.strainLevel,
    acceptanceRate: p.acceptanceRate,
    isDeactivated: p.isDeactivated,
    ridesCompleted: p.ridesCompleted || 0,
    consecutiveMisses: p.consecutiveMisses || 0,
  };
}

module.exports = {
  startRideLoop,
  stopRideLoop,
  stopAllRideLoops,
  handleAccept,
  handleDecline,
  sanitizePlayer,
};
