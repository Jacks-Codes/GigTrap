'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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
  const [roomCode, setRoomCode] = useState(null);
  const [hostToken, setHostToken] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [phase, setPhase] = useState('lobby');
  const [log, setLog] = useState([]);
  const [copied, setCopied] = useState(false);

  const addLog = useCallback((message) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev].slice(0, 60));
  }, []);

  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;

    const poll = async () => {
      const res = await fetch(`/api/room/${roomCode}`, { cache: 'no-store' });
      const data = await res.json();
      if (cancelled || !res.ok) return;
      setSnapshot(data);
      setPhase(data.phase);
    };

    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [roomCode]);

  const players = snapshot?.players || [];
  const aggregate = snapshot?.aggregate || null;

  const createRoom = async () => {
    const res = await fetch('/api/host/create-room', { method: 'POST' });
    const data = await res.json();
    setRoomCode(data.code);
    setHostToken(data.hostToken);
    setPhase('lobby');
    addLog(`Room ${data.code} created`);
  };

  const startGame = async () => {
    const res = await fetch('/api/host/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, hostToken }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return;
    setSnapshot(data.snapshot);
    setPhase('running');
    addLog('Game started');
  };

  const togglePause = async () => {
    const res = await fetch('/api/host/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, hostToken }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return;
    setSnapshot(data.snapshot);
    setPhase(data.snapshot.phase);
    addLog(data.snapshot.phase === 'stat_screen' ? 'Simulation paused' : 'Simulation resumed');
  };

  const revealResults = async () => {
    const res = await fetch('/api/host/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, hostToken }),
    });
    const data = await res.json();
    if (!res.ok || data.error) return;
    setSnapshot(data.snapshot);
    setPhase('ended');
    addLog('Reveal sent to all players');
  };

  const joinUrl = useMemo(
    () => (roomCode && typeof window !== 'undefined' ? `${window.location.origin}/join?code=${roomCode}` : ''),
    [roomCode]
  );
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
            <div>HTTP mode</div>
            <div>Phase: {phase}</div>
          </div>
        </div>

        {!roomCode ? (
          <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, padding: 24 }}>
            <button onClick={createRoom} style={{ border: 'none', background: '#111', color: '#fff', padding: '14px 18px', borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
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
                  <button onClick={togglePause} disabled={phase === 'lobby' || phase === 'ended'} style={secondaryButton}>
                    {phase === 'stat_screen' ? 'Resume' : 'Pause'}
                  </button>
                  <button onClick={revealResults} disabled={phase === 'ended'} style={secondaryButton}>Reveal</button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 24, padding: 16 }}>
                  <div style={{ fontSize: 12, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Join on phones</div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    {qrUrl ? (
                      <img src={qrUrl} alt="QR code for joining the room" style={{ width: 108, height: 108, borderRadius: 16, border: '1px solid #ececec', background: '#fff' }} />
                    ) : null}
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
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((player) => (
                        <tr key={player.playerId} style={{ borderTop: '1px solid #f0f0f0' }}>
                          <td style={cellBody}>{player.name}</td>
                          <td style={cellBody}>${player.earnings}</td>
                          <td style={cellBody}>${player.effectiveHourlyRate}/hr</td>
                          <td style={cellBody}>{player.rating}</td>
                          <td style={cellBody}>{player.strainLevel}</td>
                          <td style={cellBody}>{formatQuest(player.quest)}</td>
                          <td style={cellBody}>{player.isDeactivated ? 'Locked out' : player.engagementState}</td>
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
