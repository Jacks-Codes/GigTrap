'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSocket } from '../hooks/useSocket';

const EVENT_TYPES = [
  { key: 'phantom_surge', label: 'Phantom Surge' },
  { key: 'rating_drop', label: 'Rating Drop' },
  { key: 'quest_offer', label: 'Quest Bonus Trap' },
  { key: 'deactivation_warning', label: 'Random Deactivation' },
];

function formatQuest(quest) {
  if (!quest?.accepted || !quest?.active) return 'None';
  return `${quest.ridesCompleted}/${quest.ridesRequired} • $${quest.bonus}`;
}

function Metric({ label, value }) {
  return (
    <div style={{ border: '1px solid #e5e5e5', borderRadius: 16, padding: 14, background: '#fff' }}>
      <div style={{ fontSize: 12, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function Host() {
  const { socket, connected } = useSocket();
  const [roomCode, setRoomCode] = useState(null);
  const [hostToken, setHostToken] = useState(null);
  const [players, setPlayers] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  const [phase, setPhase] = useState('lobby');
  const [log, setLog] = useState([]);
  const [copied, setCopied] = useState(false);

  const addLog = useCallback((message) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 60));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('room:player_joined', (data) => {
      setPlayers(data.players);
      addLog(`${data.name} joined`);
    });

    socket.on('room:player_left', (data) => {
      addLog(`${data.name} left`);
      setPlayers((prev) => prev.filter((player) => player.name !== data.name));
    });

    socket.on('host:aggregate_update', setAggregate);
    socket.on('host:player_update', (data) => setPlayers(data.players));
    socket.on('host:stat_submitted', (data) => addLog(`${data.name}: ${data.answer}`));

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
      addLog(`Room ${res.code} created`);
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
      addLog(`Event: ${eventType}`);
    });
  };

  const showStats = () => {
    socket.emit('host:show_stat_screen', { code: roomCode, hostToken }, (res) => {
      if (!res?.success) return;
      setPhase('stat_screen');
      setAggregate(res.stats);
      addLog('Reflection screen shown');
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
      addLog('Reveal sent to all players');
    });
  };

  const liftDeactivation = (socketId) => {
    socket.emit('host:lift_deactivation', { code: roomCode, hostToken, socketId }, (res) => {
      if (res?.success) addLog(`Lifted ${socketId}`);
    });
  };

  const deactivatePlayer = (socketId) => {
    socket.emit('host:deactivate_player', { code: roomCode, hostToken, socketId }, (res) => {
      if (res?.success) addLog(`Deactivated ${socketId}`);
    });
  };

  const joinUrl = roomCode && typeof window !== 'undefined' ? `${window.location.origin}/join?code=${roomCode}` : '';
  const qrUrl = joinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`
    : '';

  const copyJoinUrl = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      addLog('Could not copy join URL');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f2', color: '#111', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 13, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1 }}>GigTrap Control</div>
            <h1 style={{ margin: '6px 0 0', fontSize: 38, lineHeight: 1 }}>Host Dashboard</h1>
          </div>
          <div style={{ textAlign: 'right', color: '#6b6b6b' }}>
            <div>{connected ? 'Connected' : 'Disconnected'}</div>
            <div>Phase: {phase}</div>
          </div>
        </div>

        {!roomCode ? (
          <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, padding: 24 }}>
            <button onClick={createRoom} disabled={!connected} style={{ border: 'none', background: '#111', color: '#fff', padding: '14px 18px', borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              Create Room
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18, marginBottom: 18 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, padding: 22 }}>
                <div style={{ fontSize: 12, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1 }}>Room</div>
                <div style={{ fontSize: 52, fontWeight: 700, marginTop: 6, letterSpacing: 2 }}>{roomCode}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                  <button onClick={startGame} disabled={phase !== 'lobby'} style={primaryButton}>Start</button>
                  <button onClick={showStats} disabled={phase === 'lobby' || phase === 'ended'} style={secondaryButton}>Pause / Reflect</button>
                  <button onClick={resumeGame} disabled={phase !== 'stat_screen'} style={secondaryButton}>Resume</button>
                  <button onClick={revealResults} disabled={phase === 'ended'} style={secondaryButton}>Reveal</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, padding: 16 }}>
                  <div style={{ fontSize: 12, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Join on phones</div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <img src={qrUrl} alt="QR code for joining the room" style={{ width: 108, height: 108, borderRadius: 16, border: '1px solid #ececec', background: '#fff' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#6b6b6b', marginBottom: 6 }}>Scan to open the join page with the room code prefilled.</div>
                      <div style={{ fontSize: 13, fontWeight: 600, wordBreak: 'break-all' }}>{joinUrl}</div>
                      <button onClick={copyJoinUrl} style={{ ...miniButton, marginTop: 10 }}>
                        {copied ? 'Copied' : 'Copy link'}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                  <Metric label="Players" value={aggregate?.playerCount ?? players.length} />
                  <Metric label="Avg Hourly" value={`$${aggregate?.avgHourlyRate ?? 0}/hr`} />
                  <Metric label="Deactivated" value={aggregate?.deactivatedCount ?? 0} />
                  <Metric label="Active Quests" value={aggregate?.activeQuestCount ?? 0} />
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, padding: 22, marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Events</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {EVENT_TYPES.map((event) => (
                  <button key={event.key} onClick={() => triggerEvent(event.key)} disabled={phase !== 'running' && phase !== 'event'} style={secondaryButton}>
                    {event.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18 }}>
              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, overflow: 'hidden' }}>
                <div style={{ padding: 18, borderBottom: '1px solid #ececec', fontSize: 12, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Live players
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                        <th style={cellHead}>Name</th>
                        <th style={cellHead}>Earnings</th>
                        <th style={cellHead}>Hourly</th>
                        <th style={cellHead}>Rating</th>
                        <th style={cellHead}>Strain</th>
                        <th style={cellHead}>Quest</th>
                        <th style={cellHead}>Status</th>
                        <th style={cellHead}>Controls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player) => (
                        <tr key={player.socketId} style={{ borderTop: '1px solid #f0f0f0' }}>
                          <td style={cellBody}>{player.name}</td>
                          <td style={cellBody}>${player.earnings}</td>
                          <td style={cellBody}>${player.effectiveHourlyRate}/hr</td>
                          <td style={cellBody}>{player.rating}</td>
                          <td style={cellBody}>{player.strainLevel}</td>
                          <td style={cellBody}>{formatQuest(player.quest)}</td>
                          <td style={cellBody}>{player.isDeactivated ? 'Locked out' : 'Active'}</td>
                          <td style={cellBody}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button onClick={() => deactivatePlayer(player.socketId)} disabled={player.isDeactivated} style={miniButton}>Deactivate</button>
                              <button onClick={() => liftDeactivation(player.socketId)} disabled={!player.isDeactivated} style={miniButton}>Lift</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, padding: 18 }}>
                <div style={{ fontSize: 12, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Event log</div>
                <div style={{ display: 'grid', gap: 8, maxHeight: 480, overflow: 'auto' }}>
                  {log.map((line, index) => (
                    <div key={index} style={{ border: '1px solid #ececec', borderRadius: 14, padding: '10px 12px', background: '#fafafa', fontSize: 13 }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const primaryButton = {
  border: 'none',
  background: '#111',
  color: '#fff',
  padding: '12px 16px',
  borderRadius: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButton = {
  border: '1px solid #d8d8dd',
  background: '#fff',
  color: '#111',
  padding: '12px 16px',
  borderRadius: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const miniButton = {
  border: '1px solid #d8d8dd',
  background: '#fff',
  color: '#111',
  padding: '8px 10px',
  borderRadius: 12,
  fontWeight: 600,
  cursor: 'pointer',
};

const cellHead = {
  padding: '12px 14px',
  fontSize: 12,
  color: '#6b6b6b',
  textTransform: 'uppercase',
  letterSpacing: 0.8,
};

const cellBody = {
  padding: '14px',
  fontSize: 14,
  verticalAlign: 'top',
};
