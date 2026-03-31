const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const {
  createRoom,
  getRoom,
  deleteRoom,
  getRoomByHostSocket,
  getRoomByPlayerSocket,
  getPlayerCount,
  getAggregateStats,
} = require('./roomManager');
const { createPlayerState } = require('./playerState');
const { handleEvent } = require('./events');
const {
  emitPlayerState,
  forceDeactivation,
  freezeAllPlayers,
  getPublicPlayerState,
  startRideLoop,
  stopRideLoop,
  stopAllRideLoops,
  handleAccept,
  handleDecline,
  liftDeactivation,
  markMechanic,
  pushHostUpdates,
  sanitizePlayer,
  setEngagementState,
  syncSimulatedTime,
} = require('./rideEngine');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// REST endpoint for aggregate stats
app.get('/room/:code/stats', (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json(getAggregateStats(room));
});

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // ---- Host events ----

  socket.on('host:create_room', (_, cb) => {
    const { code, hostToken } = createRoom();
    const room = getRoom(code);
    room.hostSocketId = socket.id;
    socket.join(code);
    console.log(`Room created: ${code}`);
    if (cb) cb({ code, hostToken });
  });

  socket.on('host:start_game', ({ code, hostToken }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'running';
    io.to(code).emit('game:started', { phase: 'running' });

    // Start ride loops for all connected players
    for (const [socketId, player] of room.players) {
      player.gameStartedAt = Date.now();
      setEngagementState(player, 'idle', Date.now());
      emitPlayerState(io, socketId, player);
      startRideLoop(io, room, socketId);
    }

    pushHostUpdates(io, room);
    cb?.({ success: true });
  });

  socket.on('host:trigger_event', ({ code, hostToken, eventType }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'event';
    const result = handleEvent(io, room, eventType);
    io.to(room.hostSocketId).emit('host:aggregate_update', getAggregateStats(room));
    cb?.({ success: true, event: result });
  });

  socket.on('host:show_stat_screen', ({ code, hostToken }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'stat_screen';
    freezeAllPlayers(io, room, 'paused');
    const stats = getAggregateStats(room);
    io.to(code).emit('game:stat_screen', stats);
    pushHostUpdates(io, room);
    cb?.({ success: true, stats });
  });

  socket.on('host:resume_game', ({ code, hostToken }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'running';
    io.to(code).emit('game:started', { phase: 'running' });
    for (const [socketId, player] of room.players.entries()) {
      if (!player.isDeactivated) {
        setEngagementState(player, 'idle', Date.now());
        emitPlayerState(io, socketId, player);
      }
      startRideLoop(io, room, socketId);
    }
    pushHostUpdates(io, room);
    cb?.({ success: true });
  });

  socket.on('host:end_game', ({ code, hostToken }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'ended';
    freezeAllPlayers(io, room, 'ended');
    io.to(code).emit('game:ended', getAggregateStats(room));
    pushHostUpdates(io, room);
    cb?.({ success: true });
  });

  socket.on('host:lift_deactivation', ({ code, hostToken, socketId }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    const lifted = liftDeactivation(io, room, socketId);
    cb?.({ success: lifted });
  });

  socket.on('host:deactivate_player', ({ code, hostToken, socketId }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    const deactivated = forceDeactivation(io, room, socketId, 'host_targeted');
    cb?.({ success: deactivated });
  });

  // ---- Player events ----

  socket.on('player:join', ({ code, name }, cb) => {
    const roomCode = code.toUpperCase();
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room not found' });
    if (room.phase === 'ended') return cb?.({ error: 'Game has ended' });

    const state = createPlayerState(name);
    state.gameStartedAt = Date.now();
    state.consecutiveMisses = 0;
    state.ridesCompleted = 0;
    room.players.set(socket.id, state);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    console.log(`Player "${name}" joined room ${roomCode}`);

    cb?.({ success: true, state: getPublicPlayerState(state) });

    // Notify host
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('room:player_joined', {
        name,
        playerCount: getPlayerCount(room),
        players: Array.from(room.players.entries()).map(([playerSocketId, player]) =>
          sanitizePlayer(playerSocketId, player)
        ),
      });
    }

    // If game is already running, start their ride loop
    if (room.phase === 'running' || room.phase === 'event') {
      setEngagementState(state, 'idle', Date.now());
      emitPlayerState(io, socket.id, state);
      startRideLoop(io, room, socket.id);
    }
  });

  // New ride system — server pushes requests, player responds
  socket.on('ride:accept', ({ requestId }, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = handleAccept(io, room, socket.id, requestId);
    cb?.(result);
  });

  socket.on('ride:decline', ({ requestId }, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = handleDecline(io, room, socket.id, requestId, false);
    cb?.(result);
  });

  socket.on('ride:timeout', ({ requestId }, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const result = handleDecline(io, room, socket.id, requestId, true);
    cb?.(result);
  });

  socket.on('quest:respond', ({ accepted }, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.get(socket.id);
    if (!player?.quest) return cb?.({ error: 'No quest offer available' });

    if (accepted) {
      player.quest.accepted = true;
      player.quest.active = true;
      player.quest.ridesCompleted = 0;
      player.quest.hiddenReductionTotal = 0;
      player.quest.expiresAt = Date.now() + 180000;
      markMechanic(player, 'quest_bonus_trap');
      player.strainLevel = Math.min(100, player.strainLevel + 8);
    } else {
      player.quest = null;
    }

    emitPlayerState(io, socket.id, player);
    pushHostUpdates(io, room);
    cb?.({ success: true, state: getPublicPlayerState(player) });
  });

  socket.on('player:dismiss_pay_info', (cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.get(socket.id);
    if (!player) return cb?.({ error: 'Player not found' });

    player.showPayInfoPrompt = false;
    emitPlayerState(io, socket.id, player);
    cb?.({ success: true });
  });

  socket.on('player:go_offline_attempt', (_, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.get(socket.id);
    if (!player) return cb?.({ error: 'Player not found' });

    let message = 'Your acceptance rate may be affected if you go offline during peak hours.';
    if (player.pendingRequest) {
      message = 'You have a ride request waiting.';
    } else if (player.quest?.accepted && player.quest.active) {
      const ridesLeft = Math.max(0, player.quest.ridesRequired - player.quest.ridesCompleted);
      const dollarsAway = Math.max(0, player.quest.bonus - Math.round((player.quest.hiddenReductionTotal || 0) * 10) / 10);
      message = ridesLeft > 0
        ? `You are ${ridesLeft} rides away from your Quest bonus.`
        : `You are $${dollarsAway.toFixed(0)} away from your Quest bonus.`;
    } else if (player.strainLevel >= 60) {
      message = 'Your acceptance rate may be affected if you go offline during peak hours.';
    }

    player.strainLevel = Math.min(100, player.strainLevel + (player.strainLevel >= 60 ? 4 : 2));
    markMechanic(player, 'income_targeting_trap');
    emitPlayerState(io, socket.id, player);
    pushHostUpdates(io, room);
    cb?.({ success: true, message });
  });

  socket.on('player:submit_stat', ({ answer }, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.get(socket.id);
    if (!player) return cb?.({ error: 'Player not found' });

    player.statAnswers.push(answer);
    cb?.({ success: true });

    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('host:stat_submitted', {
        name: player.name,
        answer,
      });
    }
  });

  // ---- Disconnect ----

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);

    const hostRoom = getRoomByHostSocket(socket.id);
    if (hostRoom) {
      console.log(`Host left room ${hostRoom.code}, cleaning up`);
      stopAllRideLoops(hostRoom);
      io.to(hostRoom.code).emit('game:ended', { reason: 'Host disconnected' });
      deleteRoom(hostRoom.code);
      return;
    }

    const playerRoom = getRoomByPlayerSocket(socket.id);
    if (playerRoom) {
      const player = playerRoom.players.get(socket.id);
      console.log(`Player "${player?.name}" left room ${playerRoom.code}`);
      stopRideLoop(socket.id);
      playerRoom.players.delete(socket.id);
      if (playerRoom.hostSocketId) {
        io.to(playerRoom.hostSocketId).emit('room:player_left', {
          name: player?.name,
          playerCount: getPlayerCount(playerRoom),
        });
        pushHostUpdates(io, playerRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GigTrap backend running on port ${PORT}`);
});
