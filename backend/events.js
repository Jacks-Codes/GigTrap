const { randomBetween } = require('./playerState');
const {
  applyRatingHit,
  emitPlayerState,
  forceDeactivation,
  markMechanic,
  pushHostUpdates,
} = require('./rideEngine');

const EVENT_TYPES = {
  phantom_surge: {
    name: 'Phantom Surge',
    duration: 15000,
  },
  rating_drop: {
    name: 'Rating Drop',
  },
  quest_offer: {
    name: 'Quest Bonus Trap',
  },
  deactivation_warning: {
    name: 'Account Review',
  },
};

function getRandomSubset(entries) {
  if (entries.length === 0) return [];
  const shuffled = [...entries].sort(() => Math.random() - 0.5);
  const subsetSize = Math.max(1, Math.ceil(entries.length * randomBetween(0.25, 0.5)));
  return shuffled.slice(0, subsetSize);
}

function createQuestOffer() {
  return {
    ridesRequired: 8,
    bonus: 45,
    durationSeconds: 1800,
    fareReductionMultiplier: parseFloat(randomBetween(0.8, 0.85).toFixed(2)),
  };
}

function handleEvent(io, room, eventType) {
  const eventDef = EVENT_TYPES[eventType];
  if (!eventDef) return null;

  room.currentEvent = eventType;

  switch (eventType) {
    case 'phantom_surge': {
      const surgeData = {
        type: 'phantom_surge',
        name: eventDef.name,
        surgeMultiplier: parseFloat(randomBetween(1.9, 2.3).toFixed(1)),
        zone: `Zone ${Math.floor(randomBetween(2, 8))}`,
      };

      for (const [socketId, player] of room.players.entries()) {
        if (player.isDeactivated) continue;
        if (player.engagementState === 'on_trip') continue;
        markMechanic(player, 'phantom_surge');
        io.to(socketId).emit('game:event', { ...surgeData, available: true });
      }

      const timer = setTimeout(() => {
        room.currentEvent = null;
        room.phase = 'running';
        io.to(room.code).emit('game:event_expired', {
          type: 'phantom_surge',
          message: 'Surge has ended in your area',
        });
      }, eventDef.duration);

      room.timers.push(timer);
      return surgeData;
    }

    case 'rating_drop': {
      for (const [socketId, player] of room.players.entries()) {
        if (player.isDeactivated) continue;
        const result = applyRatingHit(player);
        emitPlayerState(io, socketId, player);
        io.to(socketId).emit('game:event', {
          type: 'rating_drop',
          name: eventDef.name,
          oldRating: result.oldRating,
          newRating: result.newRating,
          reviewStars: result.reviewStars,
          reviewText: 'Passenger commented: ride experience',
        });
      }

      room.currentEvent = null;
      room.phase = 'running';
      pushHostUpdates(io, room);
      return { type: 'rating_drop' };
    }

    case 'quest_offer': {
      const offer = createQuestOffer();
      for (const [socketId, player] of room.players.entries()) {
        if (player.isDeactivated) continue;
        player.quest = {
          ...offer,
          accepted: false,
          active: false,
          ridesCompleted: 0,
          hiddenReductionTotal: 0,
          expiresAt: null,
        };
        io.to(socketId).emit('game:event', {
          type: 'quest_offer',
          name: eventDef.name,
          ridesRequired: offer.ridesRequired,
          bonus: offer.bonus,
          durationSeconds: offer.durationSeconds,
        });
        emitPlayerState(io, socketId, player);
      }

      room.currentEvent = null;
      room.phase = 'running';
      pushHostUpdates(io, room);
      return { type: 'quest_offer', ...offer };
    }

    case 'deactivation_warning': {
      const players = Array.from(room.players.entries()).filter(([, player]) => !player.isDeactivated);
      const lowRated = players.filter(([, player]) => player.rating < 4.6);
      const targets = lowRated.length > 0 ? lowRated : getRandomSubset(players);

      for (const [socketId] of targets) {
        forceDeactivation(io, room, socketId, lowRated.length > 0 ? 'rating_threshold' : 'random_review');
      }

      room.currentEvent = null;
      room.phase = 'running';
      pushHostUpdates(io, room);
      return { type: 'deactivation_warning', targetCount: targets.length };
    }
  }

  return null;
}

module.exports = { EVENT_TYPES, handleEvent };
