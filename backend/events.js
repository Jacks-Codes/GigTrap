const { randomBetween } = require('./playerState');

const EVENT_TYPES = {
  phantom_surge: {
    name: 'Phantom Surge',
    duration: 15000,
  },
  rating_drop: {
    name: 'Rating Drop',
  },
  quest_offer: {
    name: 'Quest Offer',
  },
  deactivation_warning: {
    name: 'Deactivation Warning',
  },
  fare_drought: {
    name: 'Fare Drought',
    duration: 60000,
  },
};

function handleEvent(io, room, eventType) {
  const eventDef = EVENT_TYPES[eventType];
  if (!eventDef) return null;

  room.currentEvent = eventType;

  switch (eventType) {
    case 'phantom_surge': {
      const surgeData = {
        type: 'phantom_surge',
        name: eventDef.name,
        surgeMultiplier: parseFloat(randomBetween(1.5, 3.0).toFixed(1)),
        zone: `Zone ${Math.floor(randomBetween(1, 9))}`,
      };
      io.to(room.code).emit('game:event', surgeData);
      const timer = setTimeout(() => {
        room.currentEvent = null;
        io.to(room.code).emit('game:event_expired', { type: 'phantom_surge' });
      }, eventDef.duration);
      room.timers.push(timer);
      return surgeData;
    }

    case 'rating_drop': {
      for (const [socketId, player] of room.players) {
        if (player.isDeactivated) continue;
        const drop = parseFloat(randomBetween(0.2, 0.5).toFixed(2));
        player.rating = parseFloat(Math.max(1.0, player.rating - drop).toFixed(2));
        player.strainLevel = Math.min(100, player.strainLevel + Math.floor(randomBetween(5, 15)));
        io.to(socketId).emit('player:state_update', { ...player });
      }
      room.currentEvent = null;
      io.to(room.code).emit('game:event', { type: 'rating_drop', name: eventDef.name });
      return { type: 'rating_drop' };
    }

    case 'quest_offer': {
      const questData = {
        type: 'quest_offer',
        name: eventDef.name,
        ridesRequired: Math.floor(randomBetween(3, 8)),
        bonus: parseFloat(randomBetween(5, 25).toFixed(2)),
      };
      io.to(room.code).emit('game:event', questData);
      return questData;
    }

    case 'deactivation_warning': {
      for (const [socketId, player] of room.players) {
        if (player.rating < 4.6 && !player.isDeactivated) {
          player.strainLevel = Math.min(100, player.strainLevel + 20);
          io.to(socketId).emit('game:event', {
            type: 'deactivation_warning',
            name: eventDef.name,
            personal: true,
          });
          io.to(socketId).emit('player:state_update', { ...player });
        }
      }
      room.currentEvent = null;
      return { type: 'deactivation_warning' };
    }

    case 'fare_drought': {
      for (const [, player] of room.players) {
        player.drought = true;
      }
      io.to(room.code).emit('game:event', { type: 'fare_drought', name: eventDef.name, duration: 60 });
      const timer = setTimeout(() => {
        for (const [socketId, player] of room.players) {
          player.drought = false;
          io.to(socketId).emit('player:state_update', { ...player });
        }
        room.currentEvent = null;
        io.to(room.code).emit('game:event_expired', { type: 'fare_drought' });
      }, eventDef.duration);
      room.timers.push(timer);
      return { type: 'fare_drought' };
    }
  }
}

module.exports = { handleEvent, EVENT_TYPES };
