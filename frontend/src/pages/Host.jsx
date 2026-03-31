import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';

const EVENT_TYPES = [
  { key: 'phantom_surge', label: 'Phantom Surge' },
  { key: 'rating_drop', label: 'Rating Drop' },
  { key: 'quest_offer', label: 'Quest Bonus Trap' },
  { key: 'deactivation_warning', label: 'Random Deactivation' },
];

function formatQuest(quest) {
  if (!quest?.accepted || !quest?.active) return 'none';
  return `${quest.ridesCompleted}/${quest.ridesRequired} for $${quest.bonus}`;
}

export default function Host() {
  const { socket, connected } = useSocket();
  const [roomCode, setRoomCode] = useState(null);
  const [hostToken, setHostToken] = useState(null);
  const [players, setPlayers] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  const [phase, setPhase] = useState('lobby');
  const [log, setLog] = useState([]);

  const addLog = useCallback((message) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 60));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('room:player_joined', (data) => {
      setPlayers(data.players);
      addLog(`${data.name} joined (${data.playerCount} players)`);
    });

    socket.on('room:player_left', (data) => {
      addLog(`${data.name} left (${data.playerCount} players)`);
      setPlayers((prev) => prev.filter((player) => player.name !== data.name));
    });

    socket.on('host:aggregate_update', (data) => {
      setAggregate(data);
    });

    socket.on('host:player_update', (data) => {
      setPlayers(data.players);
    });

    socket.on('host:stat_submitted', (data) => {
      addLog(`${data.name} submitted: "${data.answer}"`);
    });

    return () => {
      socket.off('room:player_joined');
      socket.off('room:player_left');
      socket.off('host:aggregate_update');
      socket.off('host:player_update');
      socket.off('host:stat_submitted');
    };
  }, [addLog, socket]);

  const createRoom = () => {
    socket.emit('host:create_room', {}, (res) => {
      setRoomCode(res.code);
      setHostToken(res.hostToken);
      addLog(`Room created: ${res.code}`);
    });
  };

  const startGame = () => {
    socket.emit('host:start_game', { code: roomCode, hostToken }, (res) => {
      if (!res?.success) return;
      setPhase('running');
      addLog('Game started');
    });
  };

  const triggerEvent = (eventType) => {
    socket.emit('host:trigger_event', { code: roomCode, hostToken, eventType }, (res) => {
      if (!res?.success) return;
      addLog(`Event triggered: ${eventType}`);
    });
  };

  const showStats = () => {
    socket.emit('host:show_stat_screen', { code: roomCode, hostToken }, (res) => {
      if (!res?.success) return;
      setPhase('stat_screen');
      setAggregate(res.stats);
      addLog('Stat screen opened');
    });
  };

  const resumeGame = () => {
    socket.emit('host:resume_game', { code: roomCode, hostToken }, (res) => {
      if (!res?.success) return;
      setPhase('running');
      addLog('Game resumed');
    });
  };

  const revealResults = () => {
    socket.emit('host:end_game', { code: roomCode, hostToken }, (res) => {
      if (!res?.success) return;
      setPhase('ended');
      addLog('Reveal triggered for all players');
    });
  };

  const liftDeactivation = (socketId) => {
    socket.emit('host:lift_deactivation', { code: roomCode, hostToken, socketId }, (res) => {
      if (res?.success) addLog(`Lifted deactivation for ${socketId}`);
    });
  };

  const deactivatePlayer = (socketId) => {
    socket.emit('host:deactivate_player', { code: roomCode, hostToken, socketId }, (res) => {
      if (res?.success) addLog(`Forced deactivation on ${socketId}`);
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', background: '#0e0e0e', color: '#f2f2f2', minHeight: '100vh' }}>
      <h1 style={{ marginTop: 0 }}>GigTrap - Host Dashboard</h1>
      <p>Socket: {connected ? 'Connected' : 'Disconnected'}</p>

      {!roomCode ? (
        <button onClick={createRoom} disabled={!connected} style={{ padding: '10px 14px', fontSize: 16 }}>
          Create Room
        </button>
      ) : (
        <>
          <h2 style={{ marginBottom: 6 }}>Room Code: <span style={{ fontSize: '1.7em' }}>{roomCode}</span></h2>
          <p>Phase: {phase} | Players: {players.length}</p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button onClick={startGame} disabled={phase !== 'lobby'}>Start Game</button>
            <button onClick={showStats} disabled={phase === 'lobby' || phase === 'ended'}>Show Stats</button>
            <button onClick={resumeGame} disabled={phase !== 'stat_screen'}>Resume</button>
            <button onClick={revealResults} disabled={phase === 'ended'}>Reveal</button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <strong>Trigger Events</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {EVENT_TYPES.map((event) => (
                <button key={event.key} onClick={() => triggerEvent(event.key)} disabled={phase !== 'running' && phase !== 'event'}>
                  {event.label}
                </button>
              ))}
            </div>
          </div>

          {aggregate && (
            <div style={{ background: '#181818', padding: 14, borderRadius: 14, marginBottom: 18, border: '1px solid #2b2b2b' }}>
              <strong>Live Aggregate</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 10 }}>
                <div>Avg earnings: ${aggregate.avgEarnings}</div>
                <div>Avg hourly: ${aggregate.avgHourlyRate}/hr</div>
                <div>Avg strain: {aggregate.avgStrain}</div>
                <div>Avg rating: {aggregate.avgRating}</div>
                <div>Deactivated: {aggregate.deactivatedCount}</div>
                <div>In quest: {aggregate.activeQuestCount}</div>
              </div>
            </div>
          )}

          <h3>Players</h3>
          <div style={{ overflowX: 'auto', marginBottom: 18 }}>
            <table border="1" cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', background: '#111', borderColor: '#2c2c2c' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Earnings</th>
                  <th>Hourly</th>
                  <th>Rating</th>
                  <th>Strain</th>
                  <th>Quest</th>
                  <th>Accept%</th>
                  <th>Rides</th>
                  <th>Deactivated</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.socketId}>
                    <td>{player.name}</td>
                    <td>${player.earnings}</td>
                    <td>${player.effectiveHourlyRate}/hr</td>
                    <td>{player.rating}</td>
                    <td>{player.strainLevel}</td>
                    <td>{formatQuest(player.quest)}</td>
                    <td>{player.acceptanceRate}%</td>
                    <td>{player.ridesCompleted || 0}</td>
                    <td>{player.isDeactivated ? 'YES' : 'no'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => deactivatePlayer(player.socketId)} disabled={player.isDeactivated}>Deactivate</button>
                        <button onClick={() => liftDeactivation(player.socketId)} disabled={!player.isDeactivated}>Lift</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Event Log</h3>
          <div style={{ maxHeight: 240, overflow: 'auto', background: '#050505', color: '#7dff8d', padding: 12, borderRadius: 12, border: '1px solid #1d1d1d', fontSize: 12 }}>
            {log.map((line, index) => <div key={index}>{line}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
