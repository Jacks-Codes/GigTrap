import { randomUUID } from 'crypto';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TIME_COMPRESSION = 8;
const WAITING_STATES = new Set(['idle', 'request_pending', 'deactivated', 'paused', 'ended']);
const DRIVING_STATES = new Set(['on_trip']);
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

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function roundCurrency(value) {
  return parseFloat(value.toFixed(2));
}

function roundSeconds(value) {
  return parseFloat(value.toFixed(1));
}

function weightedPick(entries) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
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
  return parseFloat(Math.max(2.25, baseFare * player.fareVariance).toFixed(2));
}

function getWaitTime(player) {
  const baseWait = randomBetween(5000, 15000);
  const varianceModifier = Math.max(0.8, 1.2 - ((player.fareVariance - 1) * 0.5));
  const penaltyModifier = player.suppressedUntil > Date.now() ? 2.2 : 1;
  return Math.floor(baseWait * varianceModifier * penaltyModifier);
}

function getRequestTimeout() {
  return Math.floor(randomBetween(5000, 7000));
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
  const totalSeconds = driveSeconds + waitSeconds;
  if (totalSeconds <= 0) return 0;
  return roundCurrency((player.earnings / totalSeconds) * 3600);
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

function generateRoomCode(existingRooms) {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 5; i += 1) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (existingRooms.has(code));
  return code;
}

function createPlayerState(name) {
  const rating = parseFloat(randomBetween(4.82, 4.98).toFixed(2));
  return {
    playerId: randomUUID(),
    playerToken: randomUUID(),
    name,
    earnings: 0,
    strainLevel: 0,
    rating,
    ratingSum: parseFloat((rating * 3).toFixed(2)),
    ratingCount: 3,
    acceptanceRate: Math.floor(randomBetween(88, 98)),
    fareVariance: parseFloat(randomBetween(0.82, 1.18).toFixed(2)),
    isDeactivated: false,
    ridesCompleted: 0,
    consecutiveMisses: 0,
    consecutiveDeclines: 0,
    effectiveHourlyRate: 0,
    quest: null,
    statAnswers: [],
    mechanicsSeen: ['algorithmic_wage_suppression'],
    simulatedDriveSeconds: 0,
    simulatedWaitSeconds: 0,
    simulatedMiles: 0,
    simClockRate: TIME_COMPRESSION,
    engagementState: 'idle',
    simStateStartedAt: null,
    pendingRequest: null,
    currentTrip: null,
    nextRequestAt: null,
    suppressedUntil: 0,
    showPayInfoPrompt: false,
    questHistory: [],
    createdAt: Date.now(),
  };
}

function createRideProfile(player, now = Date.now()) {
  const timeout = getRequestTimeout();
  const durationSeconds = pickRideDurationSeconds();
  const simulatedMiles = calculateMilesForDuration(durationSeconds);
  const fare = calculateFare(player, { durationSeconds, simulatedMiles });
  return {
    requestId: randomUUID(),
    fare,
    destination: DESTINATIONS[Math.floor(Math.random() * DESTINATIONS.length)],
    distance: `${simulatedMiles.toFixed(1)} mi`,
    durationSeconds,
    simulatedMiles,
    timeout,
    sentAt: now,
    expiresAt: now + timeout,
  };
}

function scheduleNextRequest(player, now = Date.now()) {
  player.nextRequestAt = now + getWaitTime(player);
  if (!player.isDeactivated) {
    setEngagementState(player, 'idle', now);
  }
}

function finalizeQuest(player, completed = false) {
  if (!player.quest) return;
  player.questHistory.push({
    ridesRequired: player.quest.ridesRequired,
    ridesCompleted: player.quest.ridesCompleted,
    bonus: player.quest.bonus,
    bonusPaid: completed ? player.quest.bonus : 0,
    hiddenReductionTotal: roundCurrency(player.quest.hiddenReductionTotal || 0),
    completed,
  });
  player.quest = null;
}

function shiftTimestamp(value, deltaMs) {
  if (!value) return value;
  return value + deltaMs;
}

function shiftPlayerDeadlines(player, deltaMs) {
  player.nextRequestAt = shiftTimestamp(player.nextRequestAt, deltaMs);

  if (player.pendingRequest) {
    player.pendingRequest.sentAt = shiftTimestamp(player.pendingRequest.sentAt, deltaMs);
    player.pendingRequest.expiresAt = shiftTimestamp(player.pendingRequest.expiresAt, deltaMs);
  }

  if (player.currentTrip) {
    player.currentTrip.startedAt = shiftTimestamp(player.currentTrip.startedAt, deltaMs);
    player.currentTrip.realEndsAt = shiftTimestamp(player.currentTrip.realEndsAt, deltaMs);
  }

  if (player.quest?.accepted && player.quest?.active) {
    player.quest.startedAt = shiftTimestamp(player.quest.startedAt, deltaMs);
    player.quest.expiresAt = shiftTimestamp(player.quest.expiresAt, deltaMs);
  }
}

function completeTrip(player, now = Date.now()) {
  if (!player.currentTrip) return;
  const trip = player.currentTrip;
  player.currentTrip = null;
  player.pendingRequest = null;
  player.earnings = roundCurrency(player.earnings + trip.fare);
  player.ridesCompleted += 1;
  player.simulatedMiles = roundCurrency(player.simulatedMiles + trip.simulatedMiles);
  player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(1, 4)));
  player.consecutiveDeclines = 0;
  player.consecutiveMisses = 0;

  if (player.quest?.accepted && player.quest.active) {
    player.quest.ridesCompleted += 1;
    player.quest.hiddenReductionTotal = roundCurrency((player.quest.hiddenReductionTotal || 0) + (trip.hiddenReductionTotal || 0));
    if (player.quest.ridesCompleted >= player.quest.ridesRequired) {
      player.earnings = roundCurrency(player.earnings + player.quest.bonus);
      finalizeQuest(player, true);
    }
  }

  if (player.ridesCompleted % 3 === 0) {
    player.showPayInfoPrompt = true;
  }

  scheduleNextRequest(player, now + 450);
}

function handleTimeoutDecline(player, now = Date.now()) {
  if (!player.pendingRequest) return;
  player.pendingRequest = null;
  player.acceptanceRate = Math.max(0, player.acceptanceRate - Math.floor(randomBetween(2, 4)));
  player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(6, 10)));
  player.consecutiveMisses += 1;
  player.consecutiveDeclines += 1;
  if (player.consecutiveDeclines > 3) {
    player.suppressedUntil = now + 60000;
  }
  scheduleNextRequest(player, now);
}

function syncPlayer(room, player, now = Date.now()) {
  if (room.phase === 'stat_screen') {
    syncSimulatedTime(player, now);
    player.engagementState = 'paused';
    return;
  }

  if (room.phase === 'ended') {
    syncSimulatedTime(player, now);
    player.engagementState = 'ended';
    return;
  }

  if (player.isDeactivated) {
    syncSimulatedTime(player, now);
    player.engagementState = 'deactivated';
    return;
  }

  if (player.currentTrip && now >= player.currentTrip.realEndsAt) {
    completeTrip(player, now);
  }

  if (player.pendingRequest && now >= player.pendingRequest.expiresAt) {
    handleTimeoutDecline(player, now);
  }

  if (room.phase !== 'running') {
    return;
  }

  if (player.quest?.accepted && player.quest.active && now > player.quest.expiresAt) {
    finalizeQuest(player, false);
  }

  if (!player.pendingRequest && !player.currentTrip) {
    if (!player.nextRequestAt) {
      scheduleNextRequest(player, now);
    }

    if (now >= player.nextRequestAt) {
      const request = createRideProfile(player, now);
      request.expiresAt = now + request.timeout + 1000;
      player.pendingRequest = request;
      player.nextRequestAt = null;
      setEngagementState(player, 'request_pending', now);
    }
  }
}

function getAggregateStats(room) {
  const players = Array.from(room.players.values());
  if (players.length === 0) {
    return {
      playerCount: 0,
      avgEarnings: 0,
      avgHourlyRate: 0,
      avgStrain: 0,
      avgRating: 0,
      deactivatedCount: 0,
      activeQuestCount: 0,
      earningsDistribution: [],
    };
  }

  const earnings = players.map((player) => player.earnings);
  return {
    playerCount: players.length,
    avgEarnings: parseFloat((earnings.reduce((sum, value) => sum + value, 0) / players.length).toFixed(2)),
    avgHourlyRate: parseFloat((players.reduce((sum, player) => sum + (player.effectiveHourlyRate || 0), 0) / players.length).toFixed(2)),
    avgStrain: parseFloat((players.reduce((sum, player) => sum + player.strainLevel, 0) / players.length).toFixed(1)),
    avgRating: parseFloat((players.reduce((sum, player) => sum + player.rating, 0) / players.length).toFixed(2)),
    deactivatedCount: players.filter((player) => player.isDeactivated).length,
    activeQuestCount: players.filter((player) => player.quest?.accepted && player.quest?.active).length,
    earningsDistribution: [...earnings].sort((a, b) => a - b),
  };
}

function sanitizePlayer(player) {
  return {
    playerId: player.playerId,
    name: player.name,
    earnings: player.earnings,
    rating: player.rating,
    ratingCount: player.ratingCount,
    strainLevel: player.strainLevel,
    acceptanceRate: player.acceptanceRate,
    isDeactivated: player.isDeactivated,
    ridesCompleted: player.ridesCompleted,
    consecutiveMisses: player.consecutiveMisses,
    engagementState: player.engagementState,
    effectiveHourlyRate: player.effectiveHourlyRate,
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

function createStore() {
  const rooms = new Map();

  return {
    createRoom() {
      const code = generateRoomCode(rooms);
      const room = {
        code,
        hostToken: randomUUID(),
        phase: 'lobby',
        pausedAt: null,
        currentEvent: null,
        players: new Map(),
        createdAt: Date.now(),
      };
      rooms.set(code, room);
      return { code: room.code, hostToken: room.hostToken };
    },

    getRoom(code) {
      return rooms.get(code?.toUpperCase());
    },

    syncRoom(code) {
      const room = rooms.get(code?.toUpperCase());
      if (!room) return null;
      const now = Date.now();
      for (const player of room.players.values()) {
        syncPlayer(room, player, now);
      }
      return room;
    },

    createPlayer(code, name) {
      const room = rooms.get(code?.toUpperCase());
      if (!room) return { error: 'Room not found' };
      if (room.phase === 'ended') return { error: 'Game has ended' };

      const player = createPlayerState(name);
      room.players.set(player.playerId, player);
      return {
        success: true,
        player,
        room,
      };
    },

    getRoomSnapshot(code) {
      const room = this.syncRoom(code);
      if (!room) return null;
      return {
        code: room.code,
        phase: room.phase,
        serverNow: Date.now(),
        currentEvent: room.currentEvent,
        aggregate: getAggregateStats(room),
        players: Array.from(room.players.values()).map(sanitizePlayer),
      };
    },

    getPlayerState(code, playerId, playerToken) {
      const room = this.syncRoom(code);
      const player = room?.players.get(playerId);
      if (!room || !player) return null;
      if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
      return {
        roomCode: room.code,
        phase: room.phase,
        serverNow: Date.now(),
        player: {
          ...player,
          pendingRequest: player.pendingRequest ? { ...player.pendingRequest } : null,
          currentTrip: player.currentTrip
            ? {
                fare: player.currentTrip.fare,
                destination: player.currentTrip.destination,
                distance: player.currentTrip.distance,
                durationMs: player.currentTrip.durationMs,
                durationSeconds: player.currentTrip.durationSeconds,
                startedAt: player.currentTrip.startedAt,
                realEndsAt: player.currentTrip.realEndsAt,
              }
            : null,
        },
      };
    },

    startGame(code, hostToken) {
      const room = rooms.get(code?.toUpperCase());
      if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
      room.phase = 'running';
      room.pausedAt = null;
      const now = Date.now();
      for (const player of room.players.values()) {
        player.nextRequestAt = now + getWaitTime(player);
        setEngagementState(player, 'idle', now);
      }
      return { success: true, snapshot: this.getRoomSnapshot(code) };
    },

    pauseGame(code, hostToken) {
      const room = rooms.get(code?.toUpperCase());
      if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
      if (room.phase === 'ended') return { error: 'Game has already ended' };

      const now = Date.now();

      if (room.phase === 'stat_screen') {
        const pausedDurationMs = Math.max(0, now - (room.pausedAt || now));
        room.phase = 'running';
        room.pausedAt = null;

        for (const player of room.players.values()) {
          shiftPlayerDeadlines(player, pausedDurationMs);
          player.simStateStartedAt = now;

          if (player.isDeactivated) {
            player.engagementState = 'deactivated';
          } else if (player.currentTrip) {
            player.engagementState = 'on_trip';
          } else if (player.pendingRequest) {
            player.engagementState = 'request_pending';
          } else {
            player.engagementState = 'idle';
          }

          player.effectiveHourlyRate = calculateEffectiveHourlyRate(player, now);
        }
      } else {
        room.phase = 'stat_screen';
        room.pausedAt = now;

        for (const player of room.players.values()) {
          syncSimulatedTime(player, now);
          player.engagementState = 'paused';
        }
      }

      return { success: true, snapshot: this.getRoomSnapshot(code) };
    },

    endGame(code, hostToken) {
      const room = rooms.get(code?.toUpperCase());
      if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
      room.phase = 'ended';
      room.pausedAt = null;
      const now = Date.now();
      for (const player of room.players.values()) {
        syncSimulatedTime(player, now);
        player.engagementState = 'ended';
      }
      return { success: true, snapshot: this.getRoomSnapshot(code) };
    },

    acceptRide(code, playerId, playerToken, requestId) {
      const room = this.syncRoom(code);
      const player = room?.players.get(playerId);
      if (!room || !player) return { error: 'Player not found' };
      if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
      if (!player.pendingRequest || player.pendingRequest.requestId !== requestId) return { error: 'Request expired' };

      const now = Date.now();
      const request = player.pendingRequest;
      player.pendingRequest = null;
      const durationMs = Math.round((request.durationSeconds / TIME_COMPRESSION) * 1000);
      player.currentTrip = {
        ...request,
        durationMs,
        startedAt: now,
        realEndsAt: now + durationMs,
      };
      setEngagementState(player, 'on_trip', now);
      return { success: true, state: this.getPlayerState(code, playerId, playerToken) };
    },

    declineRide(code, playerId, playerToken, requestId, wasTimeout = false) {
      const room = this.syncRoom(code);
      const player = room?.players.get(playerId);
      if (!room || !player) return { error: 'Player not found' };
      if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
      if (!player.pendingRequest || player.pendingRequest.requestId !== requestId) return { error: 'Request expired' };

      player.pendingRequest = null;
      player.acceptanceRate = Math.max(0, player.acceptanceRate - (wasTimeout ? Math.floor(randomBetween(2, 4)) : Math.floor(randomBetween(1, 3))));
      player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(4, 8)));
      player.consecutiveMisses += 1;
      player.consecutiveDeclines += 1;
      if (player.consecutiveDeclines > 3) {
        player.suppressedUntil = Date.now() + 60000;
      }
      scheduleNextRequest(player);
      return { success: true, state: this.getPlayerState(code, playerId, playerToken) };
    },
  };
}

const globalStore = globalThis.__gigtrapGameStore || createStore();

if (!globalThis.__gigtrapGameStore) {
  globalThis.__gigtrapGameStore = globalStore;
}

export function getGameStore() {
  return globalStore;
}
