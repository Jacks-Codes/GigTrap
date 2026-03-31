import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';

const EVENT_TYPES = [
  { key: 'phantom_surge', label: 'Phantom Surge' },
  { key: 'rating_drop', label: 'Rating Drop' },
  { key: 'quest_offer', label: 'Quest Offer' },
  { key: 'deactivation_warning', label: 'Deactivation Warning' },
  { key: 'fare_drought', label: 'Fare Drought' },
];

export default function Host() {
  const { socket, connected } = useSocket();
  const [roomCode, setRoomCode] = useState(null);
  const [hostToken, setHostToken] = useState(null);
  const [players, setPlayers] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  const [phase, setPhase] = useState('lobby');
  const [log, setLog] = useState([]);

  const addLog = useCallback((msg) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('room:player_joined', (data) => {
      setPlayers(data.players);
      addLog(`${data.name} joined (${data.playerCount} players)`);
    });

    socket.on('room:player_left', (data) => {
      addLog(`${data.name} left (${data.playerCount} players)`);
      setPlayers((prev) => prev.filter((p) => p.name !== data.name));
    });

    socket.on('host:aggregate_update', (data) => {
      setAggregate(data);
    });

    socket.on('host:stat_submitted', (data) => {
      addLog(`${data.name} submitted: "${data.answer}"`);
    });

    return () => {
      socket.off('room:player_joined');
      socket.off('room:player_left');
      socket.off('host:aggregate_update');
      socket.off('host:stat_submitted');
    };
  }, [socket, addLog]);

  const createRoom = () => {
    socket.emit('host:create_room', {}, (res) => {
      setRoomCode(res.code);
      setHostToken(res.hostToken);
      addLog(`Room created: ${res.code}`);
    });
  };

  const startGame = () => {
    socket.emit('host:start_game', { code: roomCode, hostToken }, (res) => {
      if (res.success) {
        setPhase('running');
        addLog('Game started');
      }
    });
  };

  const triggerEvent = (eventType) => {
    socket.emit('host:trigger_event', { code: roomCode, hostToken, eventType }, (res) => {
      if (res.success) addLog(`Event triggered: ${eventType}`);
    });
  };

  const showStats = () => {
    socket.emit('host:show_stat_screen', { code: roomCode, hostToken }, (res) => {
      if (res.success) {
        setPhase('stat_screen');
        setAggregate(res.stats);
        addLog('Showing stat screen');
      }
    });
  };

  const endGame = () => {
    socket.emit('host:end_game', { code: roomCode, hostToken }, (res) => {
      if (res.success) {
        setPhase('ended');
        addLog('Game ended');
      }
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>GigTrap — Host Dashboard</h1>
      <p>Socket: {connected ? 'Connected' : 'Disconnected'}</p>

      {!roomCode ? (
        <button onClick={createRoom} disabled={!connected}>Create Room</button>
      ) : (
        <>
          <h2>Room Code: <span style={{ fontSize: '2em' }}>{roomCode}</span></h2>
          <p>Phase: {phase} | Players: {players.length}</p>

          <div style={{ marginBottom: 10 }}>
            <button onClick={startGame} disabled={phase !== 'lobby'}>Start Game</button>{' '}
            <button onClick={showStats} disabled={phase === 'lobby'}>Show Stats</button>{' '}
            <button onClick={endGame} disabled={phase === 'ended'}>End Game</button>
          </div>

          <div style={{ marginBottom: 10 }}>
            <strong>Trigger Events:</strong>{' '}
            {EVENT_TYPES.map((e) => (
              <button
                key={e.key}
                onClick={() => triggerEvent(e.key)}
                disabled={phase !== 'running' && phase !== 'event'}
                style={{ marginRight: 5 }}
              >
                {e.label}
              </button>
            ))}
          </div>

          {aggregate && (
            <div style={{ background: '#f0f0f0', padding: 10, marginBottom: 10 }}>
              <strong>Aggregate Stats</strong>
              <pre>{JSON.stringify(aggregate, null, 2)}</pre>
            </div>
          )}

          <h3>Players</h3>
          <table border="1" cellPadding="5" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Name</th><th>Earnings</th><th>Rating</th><th>Strain</th><th>Accept%</th><th>Deactivated</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>${p.earnings}</td>
                  <td>{p.rating}</td>
                  <td>{p.strainLevel}</td>
                  <td>{p.acceptanceRate}%</td>
                  <td>{p.isDeactivated ? 'YES' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Event Log</h3>
          <div style={{ maxHeight: 200, overflow: 'auto', background: '#111', color: '#0f0', padding: 10, fontSize: 12 }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
