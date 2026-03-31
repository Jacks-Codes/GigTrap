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
const { createPlayerState, calculateFare } = require('./playerState');
const { handleEvent } = require('./events');

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
    cb?.({ success: true });
  });

  socket.on('host:trigger_event', ({ code, hostToken, eventType }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'event';
    const result = handleEvent(io, room, eventType);
    // Send updated aggregate to host
    io.to(room.hostSocketId).emit('host:aggregate_update', getAggregateStats(room));
    cb?.({ success: true, event: result });
  });

  socket.on('host:show_stat_screen', ({ code, hostToken }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'stat_screen';
    const stats = getAggregateStats(room);
    io.to(code).emit('game:stat_screen', stats);
    cb?.({ success: true, stats });
  });

  socket.on('host:end_game', ({ code, hostToken }, cb) => {
    const room = getRoom(code);
    if (!room || room.hostToken !== hostToken) return cb?.({ error: 'Unauthorized' });
    room.phase = 'ended';
    io.to(code).emit('game:ended', getAggregateStats(room));
    cb?.({ success: true });
  });

  // ---- Player events ----

  socket.on('player:join', ({ code, name }, cb) => {
    const roomCode = code.toUpperCase();
    const room = getRoom(roomCode);
    if (!room) return cb?.({ error: 'Room not found' });
    if (room.phase === 'ended') return cb?.({ error: 'Game has ended' });

    const state = createPlayerState(name);
    room.players.set(socket.id, state);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    console.log(`Player "${name}" joined room ${roomCode}`);

    cb?.({ success: true, state });

    // Notify host
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('room:player_joined', {
        name,
        playerCount: getPlayerCount(room),
        players: Array.from(room.players.values()).map((p) => ({
          name: p.name,
          earnings: p.earnings,
          rating: p.rating,
          strainLevel: p.strainLevel,
          acceptanceRate: p.acceptanceRate,
          isDeactivated: p.isDeactivated,
        })),
      });
    }
  });

  socket.on('player:accept_ride', (_, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.get(socket.id);
    if (!player || player.isDeactivated) return cb?.({ error: 'Cannot accept rides' });

    const fare = calculateFare(player);
    player.earnings = parseFloat((player.earnings + fare).toFixed(2));
    player.currentFare = fare;
    player.strainLevel = Math.min(100, player.strainLevel + Math.floor(Math.random() * 3));

    cb?.({ success: true, state: { ...player } });
    socket.emit('player:state_update', { ...player });

    // Update host
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('host:aggregate_update', getAggregateStats(room));
    }
  });

  socket.on('player:decline_ride', (_, cb) => {
    const room = getRoomByPlayerSocket(socket.id);
    if (!room) return cb?.({ error: 'Not in a room' });
    const player = room.players.get(socket.id);
    if (!player || player.isDeactivated) return cb?.({ error: 'Cannot act' });

    player.acceptanceRate = Math.max(0, player.acceptanceRate - Math.floor(Math.random() * 3 + 1));
    player.strainLevel = Math.min(100, player.strainLevel + Math.floor(Math.random() * 5 + 2));

    cb?.({ success: true, state: { ...player } });
    socket.emit('player:state_update', { ...player });

    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('host:aggregate_update', getAggregateStats(room));
    }
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

    // Check if it was a host
    const hostRoom = getRoomByHostSocket(socket.id);
    if (hostRoom) {
      console.log(`Host left room ${hostRoom.code}, cleaning up`);
      io.to(hostRoom.code).emit('game:ended', { reason: 'Host disconnected' });
      deleteRoom(hostRoom.code);
      return;
    }

    // Check if it was a player
    const playerRoom = getRoomByPlayerSocket(socket.id);
    if (playerRoom) {
      const player = playerRoom.players.get(socket.id);
      console.log(`Player "${player?.name}" left room ${playerRoom.code}`);
      playerRoom.players.delete(socket.id);
      if (playerRoom.hostSocketId) {
        io.to(playerRoom.hostSocketId).emit('room:player_left', {
          name: player?.name,
          playerCount: getPlayerCount(playerRoom),
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`GigTrap backend running on port ${PORT}`);
});
