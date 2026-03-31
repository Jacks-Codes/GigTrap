import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

export default function Play() {
  const { socket, connected } = useSocket();
  const [state, setState] = useState(() => {
    const saved = sessionStorage.getItem('gigtrap_player');
    return saved ? JSON.parse(saved) : null;
  });
  const [event, setEvent] = useState(null);
  const [gamePhase, setGamePhase] = useState('lobby');
  const [statInput, setStatInput] = useState('');

  useEffect(() => {
    if (!socket) return;

    socket.on('player:state_update', (data) => {
      setState(data);
    });

    socket.on('game:started', () => {
      setGamePhase('running');
    });

    socket.on('game:event', (data) => {
      setEvent(data);
      setGamePhase('event');
    });

    socket.on('game:event_expired', () => {
      setEvent(null);
      setGamePhase('running');
    });

    socket.on('game:stat_screen', () => {
      setGamePhase('stat_screen');
      setEvent(null);
    });

    socket.on('game:ended', () => {
      setGamePhase('ended');
      setEvent(null);
    });

    return () => {
      socket.off('player:state_update');
      socket.off('game:started');
      socket.off('game:event');
      socket.off('game:event_expired');
      socket.off('game:stat_screen');
      socket.off('game:ended');
    };
  }, [socket]);

  const acceptRide = () => {
    socket.emit('player:accept_ride', {}, (res) => {
      if (res.state) setState(res.state);
    });
  };

  const declineRide = () => {
    socket.emit('player:decline_ride', {}, (res) => {
      if (res.state) setState(res.state);
    });
  };

  const submitStat = () => {
    if (!statInput) return;
    socket.emit('player:submit_stat', { answer: statInput }, () => {
      setStatInput('');
    });
  };

  if (!state) return <p style={{ padding: 20 }}>No session. <a href="/join">Join a game</a></p>;

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>GigTrap — {state.name}</h1>
      <p>Socket: {connected ? 'Connected' : 'Disconnected'} | Phase: {gamePhase}</p>

      <div style={{ background: '#f5f5f5', padding: 10, marginBottom: 10 }}>
        <strong>Your Stats</strong>
        <div>Earnings: ${state.earnings}</div>
        <div>Rating: {state.rating} ★</div>
        <div>Strain: {state.strainLevel}/100</div>
        <div>Acceptance Rate: {state.acceptanceRate}%</div>
        <div>Fare Variance: {state.fareVariance}x</div>
        {state.isDeactivated && <div style={{ color: 'red', fontWeight: 'bold' }}>DEACTIVATED</div>}
      </div>

      {gamePhase === 'running' && !state.isDeactivated && (
        <div style={{ marginBottom: 10 }}>
          <button onClick={acceptRide} style={{ marginRight: 10, fontSize: 16 }}>Accept Ride</button>
          <button onClick={declineRide} style={{ fontSize: 16 }}>Decline Ride</button>
          {state.currentFare && <span style={{ marginLeft: 10 }}>Last fare: ${state.currentFare}</span>}
        </div>
      )}

      {event && (
        <div style={{ background: '#ffe0e0', padding: 10, marginBottom: 10, border: '2px solid red' }}>
          <strong>EVENT: {event.name || event.type}</strong>
          <pre>{JSON.stringify(event, null, 2)}</pre>
        </div>
      )}

      {gamePhase === 'stat_screen' && (
        <div style={{ marginBottom: 10 }}>
          <input
            placeholder="Your answer..."
            value={statInput}
            onChange={(e) => setStatInput(e.target.value)}
            style={{ marginRight: 10 }}
          />
          <button onClick={submitStat}>Submit</button>
        </div>
      )}

      {gamePhase === 'ended' && (
        <div style={{ background: '#e0ffe0', padding: 10 }}>
          <strong>Game Over</strong>
          <div>Final Earnings: ${state.earnings}</div>
          <div>Final Rating: {state.rating}</div>
        </div>
      )}
    </div>
  );
}
