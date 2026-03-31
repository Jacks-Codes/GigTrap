import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';

// Web Audio API ping sound — no external files
function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}

function vibrate() {
  try { navigator.vibrate?.(200); } catch {}
}

// Arc countdown component
function CountdownArc({ duration, elapsed, size = 120 }) {
  const remaining = Math.max(0, duration - elapsed);
  const fraction = remaining / duration;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  const seconds = (remaining / 1000).toFixed(1);

  const color = fraction > 0.5 ? '#4CAF50' : fraction > 0.25 ? '#FF9800' : '#f44336';

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#333" strokeWidth="6" />
      <circle
        cx={size/2} cy={size/2} r={radius}
        fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
      />
      <text x={size/2} y={size/2 + 8} textAnchor="middle" fill="#fff" fontSize="28" fontWeight="bold">
        {seconds}s
      </text>
    </svg>
  );
}

export default function Play() {
  const { socket, connected } = useSocket();
  const [state, setState] = useState(() => {
    const saved = sessionStorage.getItem('gigtrap_player');
    return saved ? JSON.parse(saved) : null;
  });
  const [gamePhase, setGamePhase] = useState('lobby');
  const [statInput, setStatInput] = useState('');

  // Ride request state
  const [rideRequest, setRideRequest] = useState(null);
  const [rideElapsed, setRideElapsed] = useState(0);
  const rideTimerRef = useRef(null);
  const rideStartRef = useRef(null);

  // Trip state
  const [trip, setTrip] = useState(null);
  const [tripElapsed, setTripElapsed] = useState(0);
  const tripTimerRef = useRef(null);

  // Earnings animation
  const [earningsFlash, setEarningsFlash] = useState(null);
  const flashTimerRef = useRef(null);

  // Effective hourly rate
  const [hourlyRate, setHourlyRate] = useState(0);
  const hourlyRef = useRef(null);

  // Game event overlay
  const [event, setEvent] = useState(null);

  // Update sessionStorage when state changes
  useEffect(() => {
    if (state) sessionStorage.setItem('gigtrap_player', JSON.stringify(state));
  }, [state]);

  // Effective hourly rate ticker — ticks down during idle
  useEffect(() => {
    if (gamePhase !== 'running' && gamePhase !== 'event') {
      if (hourlyRef.current) clearInterval(hourlyRef.current);
      return;
    }
    hourlyRef.current = setInterval(() => {
      setState(prev => {
        if (!prev || !prev.gameStartedAt) return prev;
        const elapsed = (Date.now() - prev.gameStartedAt) / 1000 / 3600; // hours
        const rate = elapsed > 0 ? prev.earnings / elapsed : 0;
        setHourlyRate(parseFloat(rate.toFixed(2)));
        return prev;
      });
    }, 500);
    return () => clearInterval(hourlyRef.current);
  }, [gamePhase]);

  // Ride request countdown ticker
  useEffect(() => {
    if (!rideRequest) {
      if (rideTimerRef.current) clearInterval(rideTimerRef.current);
      return;
    }
    rideStartRef.current = Date.now();
    setRideElapsed(0);
    rideTimerRef.current = setInterval(() => {
      const el = Date.now() - rideStartRef.current;
      setRideElapsed(el);
      if (el >= rideRequest.timeout) {
        // Auto-decline — time's up
        clearInterval(rideTimerRef.current);
        socket?.emit('ride:timeout', { requestId: rideRequest.requestId });
        setRideRequest(null);
      }
    }, 50);
    return () => clearInterval(rideTimerRef.current);
  }, [rideRequest, socket]);

  // Trip countdown ticker
  useEffect(() => {
    if (!trip) {
      if (tripTimerRef.current) clearInterval(tripTimerRef.current);
      return;
    }
    const start = Date.now();
    setTripElapsed(0);
    tripTimerRef.current = setInterval(() => {
      setTripElapsed(Date.now() - start);
    }, 100);
    return () => clearInterval(tripTimerRef.current);
  }, [trip]);

  const showEarningsFlash = useCallback((fare) => {
    setEarningsFlash(`+$${fare.toFixed(2)}`);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setEarningsFlash(null), 2000);
  }, []);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onStateUpdate = (data) => setState(data);

    const onGameStarted = () => setGamePhase('running');

    const onRideRequest = (data) => {
      playPing();
      vibrate();
      setRideRequest(data);
    };

    const onRideWaiting = () => {
      setRideRequest(null);
      setTrip(null);
    };

    const onTripStarted = (data) => {
      setRideRequest(null);
      setTrip(data);
    };

    const onTripCompleted = (data) => {
      showEarningsFlash(data.fare);
      setTrip(null);
    };

    const onRideDeclined = () => {
      setRideRequest(null);
    };

    const onGameEvent = (data) => {
      setEvent(data);
    };

    const onEventExpired = () => {
      setEvent(null);
    };

    const onStatScreen = () => {
      setGamePhase('stat_screen');
      setEvent(null);
      setRideRequest(null);
      setTrip(null);
    };

    const onGameEnded = () => {
      setGamePhase('ended');
      setEvent(null);
      setRideRequest(null);
      setTrip(null);
    };

    socket.on('player:state_update', onStateUpdate);
    socket.on('game:started', onGameStarted);
    socket.on('ride:request', onRideRequest);
    socket.on('ride:waiting', onRideWaiting);
    socket.on('ride:trip_started', onTripStarted);
    socket.on('ride:trip_completed', onTripCompleted);
    socket.on('ride:declined', onRideDeclined);
    socket.on('game:event', onGameEvent);
    socket.on('game:event_expired', onEventExpired);
    socket.on('game:stat_screen', onStatScreen);
    socket.on('game:ended', onGameEnded);

    return () => {
      socket.off('player:state_update', onStateUpdate);
      socket.off('game:started', onGameStarted);
      socket.off('ride:request', onRideRequest);
      socket.off('ride:waiting', onRideWaiting);
      socket.off('ride:trip_started', onTripStarted);
      socket.off('ride:trip_completed', onTripCompleted);
      socket.off('ride:declined', onRideDeclined);
      socket.off('game:event', onGameEvent);
      socket.off('game:event_expired', onEventExpired);
      socket.off('game:stat_screen', onStatScreen);
      socket.off('game:ended', onGameEnded);
    };
  }, [socket, showEarningsFlash]);

  const acceptRide = () => {
    if (!rideRequest) return;
    clearInterval(rideTimerRef.current);
    socket.emit('ride:accept', { requestId: rideRequest.requestId }, (res) => {
      if (res.state) setState(res.state);
    });
    // Don't clear rideRequest yet — trip_started will do it
  };

  const declineRide = () => {
    if (!rideRequest) return;
    clearInterval(rideTimerRef.current);
    socket.emit('ride:decline', { requestId: rideRequest.requestId });
    setRideRequest(null);
  };

  const submitStat = () => {
    if (!statInput) return;
    socket.emit('player:submit_stat', { answer: statInput }, () => setStatInput(''));
  };

  if (!state) return <p style={{ padding: 20 }}>No session. <a href="/join">Join a game</a></p>;

  // Strain-based red tint
  const strainTint = state.strainLevel > 20
    ? `rgba(255, 0, 0, ${Math.min(0.15, state.strainLevel / 500)})`
    : 'transparent';

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(${strainTint}, ${strainTint}), #111`,
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Earnings flash animation */}
      {earningsFlash && (
        <div style={{
          position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
          fontSize: 48, fontWeight: 'bold', color: '#4CAF50',
          animation: 'flashUp 2s ease-out forwards',
          zIndex: 1000, pointerEvents: 'none',
          textShadow: '0 0 20px rgba(76,175,80,0.5)',
        }}>
          {earningsFlash}
        </div>
      )}

      {/* Warning banners */}
      {state.acceptanceRate < 80 && (
        <div style={{
          background: '#FF9800', color: '#000', padding: '8px 16px',
          textAlign: 'center', fontWeight: 'bold', fontSize: 13,
        }}>
          At risk of losing access to surge zones
        </div>
      )}

      {/* Top stats bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', padding: '12px 16px',
        borderBottom: '1px solid #333', fontSize: 14,
      }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 'bold' }}>${state.earnings.toFixed(2)}</div>
          <div style={{ color: '#999', fontSize: 11 }}>Total earnings</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>{state.rating.toFixed(2)} ★</div>
          <div style={{ color: '#999', fontSize: 11 }}>{state.acceptanceRate}% accept</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: hourlyRate < 10 ? '#f44336' : '#4CAF50' }}>
            ${hourlyRate}/hr
          </div>
          <div style={{ color: '#999', fontSize: 11 }}>Effective rate</div>
        </div>
      </div>

      {/* Strain meter */}
      <div style={{ padding: '0 16px', marginTop: 4 }}>
        <div style={{
          height: 3, background: '#333', borderRadius: 2, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 2, transition: 'width 0.5s, background 0.5s',
            width: `${state.strainLevel}%`,
            background: state.strainLevel > 70 ? '#f44336' : state.strainLevel > 40 ? '#FF9800' : '#4CAF50',
          }} />
        </div>
      </div>

      {/* Main content area */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '60vh', justifyContent: 'center' }}>

        {/* Lobby */}
        {gamePhase === 'lobby' && (
          <div style={{ textAlign: 'center', color: '#999' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>Waiting for host to start...</div>
            <div style={{ fontSize: 14 }}>You're connected as <strong style={{ color: '#fff' }}>{state.name}</strong></div>
          </div>
        )}

        {/* Waiting for ride request */}
        {(gamePhase === 'running' || gamePhase === 'event') && !rideRequest && !trip && !state.isDeactivated && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 16 }}>
              <div className="spinner" style={{
                width: 40, height: 40, border: '3px solid #333', borderTop: '3px solid #4CAF50',
                borderRadius: '50%', margin: '0 auto 12px',
                animation: 'spin 1s linear infinite',
              }} />
              <div style={{ fontSize: 16, color: '#999' }}>Searching for ride requests...</div>
            </div>
            <div style={{ fontSize: 36, fontWeight: 'bold', color: hourlyRate < 10 ? '#f44336' : '#aaa' }}>
              ${hourlyRate}/hr
            </div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>effective rate — ticking while you wait</div>
          </div>
        )}

        {/* On trip */}
        {trip && (
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 320 }}>
            <div style={{ fontSize: 14, color: '#4CAF50', marginBottom: 8 }}>EN ROUTE</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 4 }}>{trip.destination}</div>
            <div style={{ color: '#999', marginBottom: 16 }}>{trip.distance}</div>
            <div style={{
              height: 4, background: '#333', borderRadius: 2, overflow: 'hidden', marginBottom: 12,
            }}>
              <div style={{
                height: '100%', background: '#4CAF50', borderRadius: 2,
                width: `${Math.min(100, (tripElapsed / trip.duration) * 100)}%`,
                transition: 'width 0.1s linear',
              }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 'bold' }}>${trip.fare.toFixed(2)}</div>
            <div style={{ color: '#999', fontSize: 12 }}>
              {Math.max(0, Math.ceil((trip.duration - tripElapsed) / 1000))}s remaining
            </div>
          </div>
        )}

        {/* Deactivated */}
        {state.isDeactivated && (
          <div style={{ textAlign: 'center', color: '#f44336' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold' }}>Account Deactivated</div>
            <div style={{ color: '#999', marginTop: 8 }}>Your account has been suspended.</div>
          </div>
        )}

        {/* Stat screen */}
        {gamePhase === 'stat_screen' && (
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 320 }}>
            <div style={{ fontSize: 18, marginBottom: 12 }}>How are you feeling?</div>
            <input
              placeholder="Your answer..."
              value={statInput}
              onChange={(e) => setStatInput(e.target.value)}
              style={{
                width: '100%', padding: 12, fontSize: 16, borderRadius: 8,
                border: '1px solid #555', background: '#222', color: '#fff',
                marginBottom: 8, boxSizing: 'border-box',
              }}
            />
            <button onClick={submitStat} style={{
              width: '100%', padding: 12, fontSize: 16, borderRadius: 8,
              background: '#4CAF50', color: '#fff', border: 'none', cursor: 'pointer',
            }}>Submit</button>
          </div>
        )}

        {/* Game ended */}
        {gamePhase === 'ended' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>SESSION COMPLETE</div>
            <div style={{ fontSize: 36, fontWeight: 'bold' }}>${state.earnings.toFixed(2)}</div>
            <div style={{ color: '#999', marginTop: 4 }}>Final rating: {state.rating.toFixed(2)} ★</div>
            <div style={{ color: '#999' }}>{state.ridesCompleted || 0} rides completed</div>
          </div>
        )}
      </div>

      {/* Game event notification */}
      {event && (
        <div style={{
          position: 'fixed', bottom: 80, left: 16, right: 16,
          background: event.type === 'deactivation_warning' ? '#f44336' : '#FF9800',
          color: '#000', padding: '12px 16px', borderRadius: 12,
          fontWeight: 'bold', fontSize: 14, textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 500,
        }}>
          {event.name || event.type}
          {event.surgeMultiplier && ` — ${event.surgeMultiplier}x in ${event.zone}`}
          {event.bonus && ` — Complete ${event.ridesRequired} rides for $${event.bonus}`}
        </div>
      )}

      {/* Consecutive miss warning */}
      {state.consecutiveMisses >= 2 && state.acceptanceRate >= 80 && (
        <div style={{
          position: 'fixed', bottom: 16, left: 16, right: 16,
          background: 'rgba(255,152,0,0.9)', color: '#000',
          padding: '8px 16px', borderRadius: 8, textAlign: 'center',
          fontSize: 12, fontWeight: 'bold', zIndex: 400,
        }}>
          Your acceptance rate is being monitored
        </div>
      )}

      {/* ===== RIDE REQUEST MODAL ===== */}
      {rideRequest && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', zIndex: 9999, padding: 24,
        }}>
          <div style={{
            background: '#1a1a1a', borderRadius: 20, padding: 24,
            width: '100%', maxWidth: 340, textAlign: 'center',
            border: '1px solid #333',
          }}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8, letterSpacing: 1 }}>
              RIDE REQUEST
            </div>

            <CountdownArc duration={rideRequest.timeout} elapsed={rideElapsed} />

            <div style={{ fontSize: 36, fontWeight: 'bold', margin: '16px 0 4px', color: '#fff' }}>
              ${rideRequest.fare.toFixed(2)}
            </div>
            <div style={{ color: '#999', fontSize: 14, marginBottom: 4 }}>
              {rideRequest.destination}
            </div>
            <div style={{ color: '#666', fontSize: 12, marginBottom: 24 }}>
              {rideRequest.distance}
            </div>

            {/* Accept button — large, green, pulsing */}
            <button
              onClick={acceptRide}
              style={{
                width: '100%', padding: '18px 0', fontSize: 22, fontWeight: 'bold',
                background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 14,
                cursor: 'pointer', marginBottom: 12,
                boxShadow: '0 0 20px rgba(76,175,80,0.3)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            >
              Accept
            </button>

            {/* Decline button — small, gray, hard to find */}
            <button
              onClick={declineRide}
              style={{
                background: 'none', border: 'none', color: '#555', fontSize: 11,
                cursor: 'pointer', padding: '4px 8px',
              }}
            >
              decline
            </button>
          </div>
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(76,175,80,0.3); }
          50% { transform: scale(1.03); box-shadow: 0 0 30px rgba(76,175,80,0.5); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes flashUp {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
        }
      `}</style>
    </div>
  );
}
