const { v4: uuidv4 } = require('uuid');

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom() {
  let code = generateRoomCode();
  while (rooms.has(code)) {
    code = generateRoomCode();
  }
  const hostToken = uuidv4();
  rooms.set(code, {
    code,
    hostToken,
    hostSocketId: null,
    phase: 'lobby',
    currentEvent: null,
    players: new Map(), // socketId -> playerState
    timers: [],
  });
  return { code, hostToken };
}

function getRoom(code) {
  return rooms.get(code);
}

function deleteRoom(code) {
  const room = rooms.get(code);
  if (room) {
    room.timers.forEach(clearTimeout);
    rooms.delete(code);
  }
}

function getRoomByHostSocket(socketId) {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId) return room;
  }
  return null;
}

function getRoomByPlayerSocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.has(socketId)) return room;
  }
  return null;
}

function getPlayerCount(room) {
  return room.players.size;
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
  const earnings = players.map((p) => p.earnings);
  return {
    playerCount: players.length,
    avgEarnings: parseFloat((earnings.reduce((a, b) => a + b, 0) / players.length).toFixed(2)),
    avgHourlyRate: parseFloat(
      (players.reduce((sum, player) => sum + (player.effectiveHourlyRate || 0), 0) / players.length).toFixed(2)
    ),
    avgStrain: parseFloat((players.reduce((a, p) => a + p.strainLevel, 0) / players.length).toFixed(1)),
    avgRating: parseFloat((players.reduce((a, p) => a + p.rating, 0) / players.length).toFixed(2)),
    deactivatedCount: players.filter((p) => p.isDeactivated).length,
    activeQuestCount: players.filter((p) => p.quest?.accepted && p.quest?.active).length,
    earningsDistribution: earnings.sort((a, b) => a - b),
  };
}

module.exports = {
  createRoom,
  getRoom,
  deleteRoom,
  getRoomByHostSocket,
  getRoomByPlayerSocket,
  getPlayerCount,
  getAggregateStats,
};
