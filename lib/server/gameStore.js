import { randomUUID } from 'crypto';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TIME_COMPRESSION = 30;
const WAITING_STATES = new Set(['idle', 'request_pending', 'deactivated', 'paused', 'ended']);
const DRIVING_STATES = new Set(['on_trip']);
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || null;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || null;
const ROOM_TTL_SECONDS = 60 * 60 * 8;
const ROOM_LOCK_MS = 4000;
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

const EVENT_TYPES = {
  phantom_surge: 'Phantom Surge',
  rating_drop: 'Rating Drop',
  quest_offer: 'Quest Bonus Trap',
  deactivation_warning: 'Random Deactivation',
  maintenance_fee: 'Maintenance Fee',
};

const MAINTENANCE_ISSUES = [
  'Transmission Repair',
  'Brake Replacement',
  'Tire Blowout',
  'Engine Overheating',
  'Oil Change Overdue',
  'Suspension Damage',
];

const QUIZ_QUESTIONS = [
  {
    id: 'wage-gap',
    prompt: 'Two drivers can do the same work and still be paid differently by the platform.',
    options: ['True', 'False'],
    correctIndex: 0,
  },
  {
    id: 'surge-chase',
    prompt: 'Chasing surge zones always guarantees higher earnings.',
    options: ['True', 'False'],
    correctIndex: 1,
  },
  {
    id: 'ratings-fragile',
    prompt: 'New drivers are protected from bad ratings because of low sample size.',
    options: ['True', 'False'],
    correctIndex: 1,
  },
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

function markMechanic(player, mechanicKey) {
  if (!player.mechanicsSeen.includes(mechanicKey)) {
    player.mechanicsSeen.push(mechanicKey);
  }
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
    { min: 480, max: 900, weight: 3.2 },
    { min: 900, max: 1500, weight: 3.6 },
    { min: 1500, max: 2400, weight: 1.8 },
    { min: 2400, max: 4200, weight: 0.8 },
  ]);
  return Math.round(randomBetween(bucket.min, bucket.max));
}

function calculateMilesForDuration(durationSeconds) {
  const averageSpeed = randomBetween(10, 22);
  const rawMiles = (durationSeconds / 3600) * averageSpeed;
  return parseFloat(Math.max(1.2, rawMiles).toFixed(1));
}

function calculateFare(player, ride) {
  const tripMinutes = ride.durationSeconds / 60;
  const baseFare = 1.35 + (ride.simulatedMiles * 0.72) + (tripMinutes * 0.16);
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

function getRoomKey(code) {
  return `gigtrap:room:${code?.toUpperCase()}`;
}

function getRoomLockKey(code) {
  return `gigtrap:room-lock:${code?.toUpperCase()}`;
}

function getRoomPlayersKey(code) {
  return `gigtrap:room-players:${code?.toUpperCase()}`;
}

function getPlayerKey(playerId) {
  return `gigtrap:player:${playerId}`;
}

function canUseRedis() {
  return !!(REDIS_URL && REDIS_TOKEN);
}

async function redisCommand(command) {
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Redis request failed with status ${response.status}`);
  }

  return payload.result;
}

function serializeRoom(room) {
  return JSON.stringify({
    ...room,
    players: Array.from(room.players.entries()),
  });
}

function deserializeRoom(serialized) {
  if (!serialized) return null;
  const room = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  return {
    ...room,
    players: new Map(room.players || []),
  };
}

function deserializePlayer(serialized) {
  if (!serialized) return null;
  return typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
    lastTripPayout: 0,
    lastTripCompletedAt: null,
    deactivationReason: null,
    eventCursor: 0,
    activeSurge: null,
    pendingQuestOffer: null,
    latestRatingDrop: null,
    activeQuiz: null,
    pendingMaintenanceFee: null,
    createdAt: Date.now(),
  };
}

function createRideProfile(player, now = Date.now()) {
  const timeout = getRequestTimeout();
  const durationSeconds = pickRideDurationSeconds();
  const simulatedMiles = calculateMilesForDuration(durationSeconds);
  const baseFare = calculateFare(player, { durationSeconds, simulatedMiles });
  let fare = baseFare;
  let hiddenReductionTotal = 0;

  if (player.quest?.accepted && player.quest.active) {
    const multiplier = player.quest.fareReductionMultiplier || 0.83;
    fare = roundCurrency(baseFare * multiplier);
    hiddenReductionTotal = roundCurrency(baseFare - fare);
  }

  return {
    requestId: randomUUID(),
    fare,
    baseFare,
    hiddenReductionTotal,
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
  player.pendingQuestOffer = null;
}

function createQuestOffer() {
  return {
    ridesRequired: 8,
    bonus: 45,
    durationSeconds: 1800,
    fareReductionMultiplier: parseFloat(randomBetween(0.8, 0.85).toFixed(2)),
  };
}

function getRandomSubset(entries) {
  if (entries.length === 0) return [];
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const subsetSize = Math.max(1, Math.ceil(entries.length * randomBetween(0.25, 0.5)));
  return shuffled.slice(0, subsetSize);
}

function adjustRating(player, delta) {
  const nextRating = Math.max(1, Math.min(5, roundCurrency(player.rating + delta)));
  player.rating = nextRating;
  player.ratingSum = roundCurrency(nextRating * player.ratingCount);
}

function applyRatingHit(player) {
  const oldRating = player.rating;
  const reviewStars = Math.random() < 0.65 ? 1 : Math.random() < 0.8 ? 2 : 3;
  player.ratingSum = roundCurrency(player.ratingSum + reviewStars);
  player.ratingCount += 1;
  player.rating = roundCurrency(player.ratingSum / player.ratingCount);
  player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(8, 16)));
  markMechanic(player, 'ratings_roulette');
  player.eventCursor += 1;
  player.latestRatingDrop = {
    eventId: `rating-${player.eventCursor}`,
    oldRating,
    newRating: player.rating,
    reviewStars,
    reviewText: 'Passenger commented: ride experience',
  };
  return player.latestRatingDrop;
}

function forceDeactivation(player, source = 'host_review', now = Date.now()) {
  if (!player || player.isDeactivated) return false;
  player.pendingRequest = null;
  player.currentTrip = null;
  player.isDeactivated = true;
  player.deactivationReason = source;
  player.strainLevel = Math.min(100, player.strainLevel + 20);
  markMechanic(player, 'deactivation_black_box');
  setEngagementState(player, 'deactivated', now);
  return true;
}

function liftDeactivation(player, now = Date.now()) {
  if (!player || !player.isDeactivated) return false;
  player.isDeactivated = false;
  player.deactivationReason = null;
  player.pendingRequest = null;
  player.currentTrip = null;
  setEngagementState(player, 'idle', now);
  return true;
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
  player.lastTripPayout = trip.fare;
  player.lastTripCompletedAt = now;
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
  if (player.activeSurge?.expiresAt && now >= player.activeSurge.expiresAt) {
    player.activeSurge = null;
  }

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

  if (player.activeQuiz?.expiresAt && now > player.activeQuiz.expiresAt) {
    player.activeQuiz = null;
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
    simulatedMiles: player.simulatedMiles,
    simulatedDriveSeconds: player.simulatedDriveSeconds,
    simulatedWaitSeconds: player.simulatedWaitSeconds,
    fareVariance: player.fareVariance,
    lastTripPayout: player.lastTripPayout || 0,
    lastTripCompletedAt: player.lastTripCompletedAt,
    suppressedUntil: player.suppressedUntil,
    hasPendingRequest: !!player.pendingRequest,
    hasCurrentTrip: !!player.currentTrip,
    deactivationReason: player.deactivationReason,
    activeSurge: player.activeSurge,
    pendingQuestOffer: player.pendingQuestOffer,
    latestRatingDrop: player.latestRatingDrop,
    pendingMaintenanceFee: player.pendingMaintenanceFee,
    activeQuiz: player.activeQuiz
      ? {
          quizId: player.activeQuiz.quizId,
          prompt: player.activeQuiz.prompt,
          options: player.activeQuiz.options,
          expiresAt: player.activeQuiz.expiresAt,
          answeredAt: player.activeQuiz.answeredAt || null,
          selectedIndex: player.activeQuiz.selectedIndex ?? null,
          result: player.activeQuiz.result || null,
        }
      : null,
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

function buildRoomSnapshot(room) {
  return {
    code: room.code,
    phase: room.phase,
    serverNow: Date.now(),
    currentEvent: room.currentEvent,
    aggregate: getAggregateStats(room),
    players: Array.from(room.players.values()).map(sanitizePlayer),
  };
}

function buildPlayerState(room, player) {
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
      lastTripPayout: player.lastTripPayout || 0,
      lastTripCompletedAt: player.lastTripCompletedAt,
      deactivationReason: player.deactivationReason,
      activeSurge: player.activeSurge,
      pendingQuestOffer: player.pendingQuestOffer,
      latestRatingDrop: player.latestRatingDrop,
      activeQuiz: player.activeQuiz
        ? {
            quizId: player.activeQuiz.quizId,
            prompt: player.activeQuiz.prompt,
            options: player.activeQuiz.options,
            expiresAt: player.activeQuiz.expiresAt,
            answeredAt: player.activeQuiz.answeredAt || null,
            selectedIndex: player.activeQuiz.selectedIndex ?? null,
            result: player.activeQuiz.result || null,
          }
        : null,
    },
  };
}

function createStore() {
  const rooms = new Map();

  async function loadRoom(code) {
    const normalizedCode = code?.toUpperCase();
    if (!normalizedCode) return null;

    if (!canUseRedis()) {
      return rooms.get(normalizedCode) || null;
    }

    const serialized = await redisCommand(['GET', getRoomKey(normalizedCode)]);
    const room = deserializeRoom(serialized);
    if (!room) return null;
    return hydrateMissingPlayers(room);
  }

  async function saveRoom(room) {
    if (!room) return null;

    if (!canUseRedis()) {
      rooms.set(room.code, room);
      return room;
    }

    await redisCommand(['SET', getRoomKey(room.code), serializeRoom(room), 'EX', ROOM_TTL_SECONDS]);
    for (const [playerId, player] of room.players.entries()) {
      await redisCommand(['SET', getPlayerKey(playerId), JSON.stringify(player), 'EX', ROOM_TTL_SECONDS]);
    }
    return room;
  }

  async function hydrateMissingPlayers(room) {
    if (!room || !canUseRedis()) return room;

    const playerIds = await redisCommand(['SMEMBERS', getRoomPlayersKey(room.code)]);
    if (!Array.isArray(playerIds) || playerIds.length === 0) return room;

    for (const playerId of playerIds) {
      if (room.players.has(playerId)) continue;
      const serializedPlayer = await redisCommand(['GET', getPlayerKey(playerId)]);
      const player = deserializePlayer(serializedPlayer);
      if (player) {
        room.players.set(playerId, player);
      }
    }

    return room;
  }

  async function addPlayerToRoomIndex(code, playerId) {
    if (!canUseRedis()) return;
    await redisCommand(['SADD', getRoomPlayersKey(code), playerId]);
    await redisCommand(['EXPIRE', getRoomPlayersKey(code), ROOM_TTL_SECONDS]);
  }

  async function acquireRoomLock(code) {
    if (!canUseRedis()) return null;

    const lockKey = getRoomLockKey(code);
    const token = randomUUID();

    for (let attempt = 0; attempt < 15; attempt += 1) {
      const result = await redisCommand(['SET', lockKey, token, 'NX', 'PX', ROOM_LOCK_MS]);
      if (result === 'OK') {
        return { lockKey, token };
      }
      await sleep(60 + (attempt * 20));
    }

    throw new Error(`Could not acquire room lock for ${code}`);
  }

  async function releaseRoomLock(lock) {
    if (!lock || !canUseRedis()) return;
    const currentToken = await redisCommand(['GET', lock.lockKey]);
    if (currentToken === lock.token) {
      await redisCommand(['DEL', lock.lockKey]);
    }
  }

  async function withRoomTransaction(code, handler) {
    const normalizedCode = code?.toUpperCase();
    const lock = await acquireRoomLock(normalizedCode);

    try {
      const room = await loadRoom(normalizedCode);
      const result = await handler(room);
      if (room) {
        await saveRoom(room);
      }
      return result;
    } finally {
      await releaseRoomLock(lock);
    }
  }

  return {
    async createRoom() {
      let code = '';
      let existing = null;

      do {
        code = generateRoomCode(rooms);
        existing = await loadRoom(code);
      } while (existing);

      const room = {
        code,
        hostToken: randomUUID(),
        phase: 'lobby',
        pausedAt: null,
        currentEvent: null,
        players: new Map(),
        createdAt: Date.now(),
      };
      await saveRoom(room);
      return { code: room.code, hostToken: room.hostToken };
    },

    async getRoom(code) {
      return loadRoom(code);
    },

    async syncRoom(code, { persist = true } = {}) {
      const room = await loadRoom(code);
      if (!room) return null;
      const now = Date.now();
      for (const player of room.players.values()) {
        syncPlayer(room, player, now);
      }
      if (persist) {
        await saveRoom(room);
      }
      return room;
    },

    async createPlayer(code, name) {
      return withRoomTransaction(code, async (room) => {
        if (!room) return { error: 'Room not found' };
        if (room.phase === 'ended') return { error: 'Game has ended' };

        const player = createPlayerState(name);
        room.players.set(player.playerId, player);
        await addPlayerToRoomIndex(room.code, player.playerId);
        return {
          success: true,
          player,
          room,
        };
      });
    },

    async getRoomSnapshot(code) {
      return withRoomTransaction(code, async (room) => {
        if (!room) return null;
        const now = Date.now();
        for (const player of room.players.values()) {
          syncPlayer(room, player, now);
        }
        return buildRoomSnapshot(room);
      });
    },

    async getPlayerState(code, playerId, playerToken) {
      return withRoomTransaction(code, async (room) => {
        if (!room) return null;
        const now = Date.now();
        for (const currentPlayer of room.players.values()) {
          syncPlayer(room, currentPlayer, now);
        }
        const player = room.players.get(playerId);
        if (!player) return null;
        if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
        return buildPlayerState(room, player);
      });
    },

    async startGame(code, hostToken) {
      return withRoomTransaction(code, async (room) => {
        if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
        room.phase = 'running';
        room.pausedAt = null;
        const now = Date.now();
        for (const player of room.players.values()) {
          player.nextRequestAt = now + getWaitTime(player);
          setEngagementState(player, 'idle', now);
        }
        return { success: true, snapshot: buildRoomSnapshot(room) };
      });
    },

    async pauseGame(code, hostToken) {
      return withRoomTransaction(code, async (room) => {
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

            if (player.isDeactivated) player.engagementState = 'deactivated';
            else if (player.currentTrip) player.engagementState = 'on_trip';
            else if (player.pendingRequest) player.engagementState = 'request_pending';
            else player.engagementState = 'idle';

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

        return { success: true, snapshot: buildRoomSnapshot(room) };
      });
    },

    async endGame(code, hostToken) {
      return withRoomTransaction(code, async (room) => {
        if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
        room.phase = 'ended';
        room.pausedAt = null;
        const now = Date.now();
        for (const player of room.players.values()) {
          syncSimulatedTime(player, now);
          player.engagementState = 'ended';
        }
        return { success: true, snapshot: buildRoomSnapshot(room) };
      });
    },

    async triggerEvent(code, hostToken, eventType) {
      return withRoomTransaction(code, async (room) => {
        if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
        if (!EVENT_TYPES[eventType]) return { error: 'Unknown event' };

        const now = Date.now();
        const players = Array.from(room.players.values());
        const activePlayers = players.filter((player) => !player.isDeactivated);

        switch (eventType) {
        case 'phantom_surge': {
          const surgeMultiplier = parseFloat(randomBetween(1.9, 2.3).toFixed(1));
          const expiresAt = now + 15000;
          const targets = getRandomSubset(activePlayers.filter((player) => player.engagementState !== 'on_trip'));
          targets.forEach((player) => {
            if (player.engagementState === 'on_trip') return;
            markMechanic(player, 'phantom_surge');
            player.eventCursor += 1;
            player.activeSurge = {
              eventId: `surge-${player.eventCursor}`,
              surgeMultiplier,
              zone: `Zone ${Math.floor(randomBetween(2, 8))}`,
              expiresAt,
            };
          });
          room.currentEvent = { type: eventType, expiresAt };
          break;
        }
        case 'rating_drop': {
          getRandomSubset(activePlayers).forEach((player) => {
            applyRatingHit(player);
          });
          room.currentEvent = { type: eventType, expiresAt: now + 1500 };
          break;
        }
        case 'quest_offer': {
          const offer = createQuestOffer();
          getRandomSubset(activePlayers).forEach((player) => {
            player.pendingQuestOffer = {
              ...offer,
              eventId: `quest-${player.playerId}-${now}`,
            };
            player.quest = {
              ...offer,
              accepted: false,
              active: false,
              ridesCompleted: 0,
              hiddenReductionTotal: 0,
              expiresAt: null,
            };
          });
          room.currentEvent = { type: eventType, expiresAt: now + 1000 };
          break;
        }
        case 'deactivation_warning': {
          const entries = Array.from(room.players.entries()).filter(([, player]) => !player.isDeactivated);
          const lowRated = entries.filter(([, player]) => player.rating < 4.6);
          const targets = lowRated.length > 0 ? getRandomSubset(lowRated) : getRandomSubset(entries);
          targets.forEach(([, player]) => {
            forceDeactivation(player, lowRated.length > 0 ? 'rating_threshold' : 'random_review', now);
          });
          room.currentEvent = { type: eventType, expiresAt: now + 1000 };
          break;
        }
        case 'maintenance_fee': {
          if (activePlayers.length === 0) break;
          const target = activePlayers[Math.floor(Math.random() * activePlayers.length)];
          const issue = MAINTENANCE_ISSUES[Math.floor(Math.random() * MAINTENANCE_ISSUES.length)];
          const amount = parseFloat((Math.floor(randomBetween(150, 400)) + 0).toFixed(2));
          target.earnings = roundCurrency(target.earnings - amount);
          target.strainLevel = Math.min(100, target.strainLevel + 15);
          target.eventCursor += 1;
          target.pendingMaintenanceFee = {
            eventId: `maint-${target.playerId}-${target.eventCursor}`,
            issue,
            amount,
          };
          markMechanic(target, 'maintenance_fee');
          room.currentEvent = { type: eventType, expiresAt: now + 1000 };
          break;
        }
        default:
          return { error: 'Unknown event' };
        }

        return { success: true, snapshot: buildRoomSnapshot(room) };
      });
    },

    async triggerQuestion(code, hostToken) {
      return withRoomTransaction(code, async (room) => {
        if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
        const question = QUIZ_QUESTIONS[Math.floor(Math.random() * QUIZ_QUESTIONS.length)];
        const now = Date.now();
        const expiresAt = now + 45000;

        Array.from(room.players.values())
          .filter((player) => !player.isDeactivated)
          .forEach((player) => {
            player.activeQuiz = {
              quizId: `${question.id}-${now}-${player.playerId}`,
              questionId: question.id,
              prompt: question.prompt,
              options: question.options,
              correctIndex: question.correctIndex,
              expiresAt,
              answeredAt: null,
              selectedIndex: null,
              result: null,
            };
          });

        return { success: true, snapshot: buildRoomSnapshot(room), question };
      });
    },

    async answerQuestion(code, playerId, playerToken, selectedIndex) {
      return withRoomTransaction(code, async (room) => {
        const now = Date.now();
        if (!room) return { error: 'Player not found' };
        for (const currentPlayer of room.players.values()) {
          syncPlayer(room, currentPlayer, now);
        }
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
        if (!player.activeQuiz) return { error: 'No active question' };
        if (player.activeQuiz.answeredAt) return { error: 'Question already answered' };

        const correct = selectedIndex === player.activeQuiz.correctIndex;
        player.activeQuiz.answeredAt = now;
        player.activeQuiz.selectedIndex = selectedIndex;
        player.activeQuiz.result = correct ? 'correct' : 'incorrect';

        if (correct) {
          player.earnings = roundCurrency(player.earnings + 2.5);
          adjustRating(player, 0.03);
        } else {
          adjustRating(player, -0.08);
          markMechanic(player, 'ratings_roulette');
        }

        return {
          success: true,
          correct,
          reward: correct ? 2.5 : 0,
          state: buildPlayerState(room, player),
        };
      });
    },

    async goOfflineAttempt(code, playerId, playerToken) {
      return withRoomTransaction(code, async (room) => {
        const now = Date.now();
        if (!room) return { error: 'Player not found' };
        for (const currentPlayer of room.players.values()) {
          syncPlayer(room, currentPlayer, now);
        }
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        if (player.playerToken !== playerToken) return { error: 'Unauthorized' };

        let message = 'Your acceptance rate may be affected if you go offline during peak hours.';
        if (player.pendingRequest) {
          message = 'You have a ride request waiting.';
        } else if (player.quest?.accepted && player.quest.active) {
          const ridesLeft = Math.max(0, player.quest.ridesRequired - player.quest.ridesCompleted);
          const dollarsAway = Math.max(0, player.quest.bonus - Math.round((player.quest.hiddenReductionTotal || 0) * 10) / 10);
          message = ridesLeft > 0
            ? `You are ${ridesLeft} rides away from your Quest bonus.`
            : `You are $${dollarsAway.toFixed(0)} away from your Quest bonus.`;
        }

        player.strainLevel = Math.min(100, player.strainLevel + (player.strainLevel >= 60 ? 4 : 2));
        markMechanic(player, 'income_targeting_trap');

        return {
          success: true,
          message,
          state: buildPlayerState(room, player),
        };
      });
    },

    async deactivatePlayer(code, hostToken, playerId) {
      return withRoomTransaction(code, async (room) => {
        if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        forceDeactivation(player, 'host_targeted');
        return { success: true, snapshot: buildRoomSnapshot(room) };
      });
    },

    async liftDeactivation(code, hostToken, playerId) {
      return withRoomTransaction(code, async (room) => {
        if (!room || room.hostToken !== hostToken) return { error: 'Unauthorized' };
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        liftDeactivation(player);
        return { success: true, snapshot: buildRoomSnapshot(room) };
      });
    },

    async respondQuest(code, playerId, playerToken, accepted) {
      return withRoomTransaction(code, async (room) => {
        if (!room) return { error: 'Player not found' };
        const now = Date.now();
        const now = Date.now();
        if (!room) return { error: 'Player not found' };
        for (const currentPlayer of room.players.values()) {
          syncPlayer(room, currentPlayer, now);
        }
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
        if (!player.pendingQuestOffer || !player.quest) return { error: 'No quest offer available' };

        if (accepted) {
          player.quest.accepted = true;
          player.quest.active = true;
          player.quest.ridesCompleted = 0;
          player.quest.hiddenReductionTotal = 0;
          player.quest.expiresAt = now + 180000;
          markMechanic(player, 'quest_bonus_trap');
          player.strainLevel = Math.min(100, player.strainLevel + 8);
        } else {
          player.quest = null;
        }

        player.pendingQuestOffer = null;
        return { success: true, state: buildPlayerState(room, player) };
      });
    },

    async acceptRide(code, playerId, playerToken, requestId) {
      return withRoomTransaction(code, async (room) => {
        const now = Date.now();
        if (!room) return { error: 'Player not found' };
        for (const currentPlayer of room.players.values()) {
          syncPlayer(room, currentPlayer, now);
        }
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
        if (!player.pendingRequest || player.pendingRequest.requestId !== requestId) return { error: 'Request expired' };

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
        return { success: true, state: buildPlayerState(room, player) };
      });
    },

    async acknowledgeMaintenanceFee(code, playerId, playerToken) {
      return withRoomTransaction(code, async (room) => {
        if (!room) return { error: 'Player not found' };
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
        player.pendingMaintenanceFee = null;
        return { success: true, state: buildPlayerState(room, player) };
      });
    },

    async declineRide(code, playerId, playerToken, requestId, wasTimeout = false) {
      return withRoomTransaction(code, async (room) => {
        const now = Date.now();
        if (!room) return { error: 'Player not found' };
        for (const currentPlayer of room.players.values()) {
          syncPlayer(room, currentPlayer, now);
        }
        const player = room.players.get(playerId);
        if (!player) return { error: 'Player not found' };
        if (player.playerToken !== playerToken) return { error: 'Unauthorized' };
        if (!player.pendingRequest || player.pendingRequest.requestId !== requestId) return { error: 'Request expired' };

        player.pendingRequest = null;
        player.acceptanceRate = Math.max(0, player.acceptanceRate - (wasTimeout ? Math.floor(randomBetween(2, 4)) : Math.floor(randomBetween(1, 3))));
        player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(4, 8)));
        player.consecutiveMisses += 1;
        player.consecutiveDeclines += 1;
        if (player.consecutiveDeclines > 3) {
          player.suppressedUntil = now + 60000;
        }
        scheduleNextRequest(player, now);
        return { success: true, state: buildPlayerState(room, player) };
      });
    },
  };
}

if (canUseRedis()) {
  console.log('[GigTrap] Redis configured — using Upstash REST API for room state.', REDIS_URL);
} else {
  console.error(
    '[GigTrap] WARNING: No Redis environment variables found (KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN). ' +
    'Falling back to in-memory store. On Vercel, each serverless container has its own memory — room state WILL be lost across cold starts and parallel invocations. ' +
    'Configure a Redis/KV integration to fix state loss.'
  );
}

const globalStore = globalThis.__gigtrapGameStore || createStore();

if (!globalThis.__gigtrapGameStore) {
  globalThis.__gigtrapGameStore = globalStore;
}

export function getGameStore() {
  return globalThis.__gigtrapGameStore;
}
