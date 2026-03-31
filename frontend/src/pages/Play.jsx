import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket';

const CITATIONS = {
  phantom_surge: ['Phantom Surge', 'HRW Report, 2025'],
  quest_bonus_trap: ['Quest Bonus Trap', 'Dubal, Columbia Law Review, 2023'],
  ratings_roulette: ['Ratings Roulette', 'HRW Report, 2025'],
  algorithmic_wage_suppression: ['Algorithmic Wage Suppression', 'Dubal, Columbia Law Review, 2023'],
  forward_dispatch: ['Forward Dispatch', 'NYT, 2017'],
  deactivation_black_box: ['Deactivation Black Box', 'HRW Report, 2025'],
  income_targeting_trap: ['Income Targeting Trap', 'Camerer et al., CMU/QJE, 1997'],
};

function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, len: 0.09, gain: 0.1 },
      { freq: 1174, start: 0.11, len: 0.09, gain: 0.08 },
      { freq: 1568, start: 0.24, len: 0.14, gain: 0.09 },
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note.freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.len);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.len + 0.02);
    });
  } catch {
    // audio is optional
  }
}

function vibrate() {
  try {
    navigator.vibrate?.([120, 30, 120]);
  } catch {
    // vibration is optional
  }
}

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function formatClock(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, Math.floor(seconds % 60));
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function calculateProjectedHourlyRate(state) {
  if (!state) return 0;

  const waitStates = new Set(['idle', 'request_pending', 'deactivated']);
  const driveStates = new Set(['on_trip']);
  let driveSeconds = state.simulatedDriveSeconds || 0;
  let waitSeconds = state.simulatedWaitSeconds || 0;

  if (state.simStateStartedAt) {
    const elapsedRealSeconds = Math.max(0, (Date.now() - state.simStateStartedAt) / 1000);
    const simDelta = elapsedRealSeconds * (state.simClockRate || 8);
    if (driveStates.has(state.engagementState)) driveSeconds += simDelta;
    if (waitStates.has(state.engagementState)) waitSeconds += simDelta;
  }

  const totalSimulatedSeconds = driveSeconds + waitSeconds;
  if (totalSimulatedSeconds <= 0) return 0;
  return parseFloat(((state.earnings / totalSimulatedSeconds) * 3600).toFixed(2));
}

function CountdownArc({ duration, elapsed, size = 120 }) {
  const remaining = Math.max(0, duration - elapsed);
  const fraction = remaining / duration;
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  const seconds = Math.max(0, remaining / 1000).toFixed(1);
  const color = fraction > 0.5 ? '#000' : fraction > 0.25 ? '#6e6e73' : '#d33b31';

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#d9d9de" strokeWidth="8" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s linear' }}
      />
      <text x={size / 2} y={size / 2 + 10} textAnchor="middle" fill="#111" fontSize="28" fontWeight="700">
        {seconds}
      </text>
    </svg>
  );
}

function StatPill({ label, value, tone = 'default' }) {
  const color = tone === 'danger' ? '#d33b31' : tone === 'warn' ? '#d59d21' : '#111';
  return (
    <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 18, padding: '10px 12px', minWidth: 0 }}>
      <div style={{ color: '#70757a', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function Play() {
  const { socket } = useSocket();
  const [state, setState] = useState(() => {
    const saved = sessionStorage.getItem('gigtrap_player');
    return saved ? JSON.parse(saved) : null;
  });
  const [gamePhase, setGamePhase] = useState('lobby');
  const [statInput, setStatInput] = useState('');
  const [rideRequest, setRideRequest] = useState(null);
  const [rideElapsed, setRideElapsed] = useState(0);
  const [trip, setTrip] = useState(null);
  const [tripElapsed, setTripElapsed] = useState(0);
  const [earningsFlash, setEarningsFlash] = useState(null);
  const [ratingDisplay, setRatingDisplay] = useState(() => state?.rating || 5);
  const [hourlyRate, setHourlyRate] = useState(() => calculateProjectedHourlyRate(state));
  const [surgeState, setSurgeState] = useState(null);
  const [ratingDropCard, setRatingDropCard] = useState(null);
  const [questOffer, setQuestOffer] = useState(null);
  const [toast, setToast] = useState(null);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const flashTimerRef = useRef(null);
  const rideTimerRef = useRef(null);
  const rideStartRef = useRef(null);
  const tripTimerRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    if (state) sessionStorage.setItem('gigtrap_player', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const timer = setInterval(() => setHourlyRate(calculateProjectedHourlyRate(state)), 250);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!rideRequest) {
      if (rideTimerRef.current) clearInterval(rideTimerRef.current);
      return;
    }

    rideStartRef.current = Date.now();
    rideTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - rideStartRef.current;
      setRideElapsed(elapsed);
      if (elapsed >= rideRequest.timeout) {
        clearInterval(rideTimerRef.current);
        socket?.emit('ride:timeout', { requestId: rideRequest.requestId });
        setRideRequest(null);
      }
    }, 50);

    return () => clearInterval(rideTimerRef.current);
  }, [rideRequest, socket]);

  useEffect(() => {
    if (!trip) {
      if (tripTimerRef.current) clearInterval(tripTimerRef.current);
      return;
    }

    const startedAt = Date.now();
    tripTimerRef.current = setInterval(() => setTripElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(tripTimerRef.current);
  }, [trip]);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const showEarningsFlash = useCallback((fare) => {
    setEarningsFlash(`+${formatMoney(fare)}`);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setEarningsFlash(null), 2000);
  }, []);

  const animateRatingDrop = useCallback((oldRating, newRating) => {
    const startedAt = Date.now();
    const duration = 1500;
    const delta = oldRating - newRating;

    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      setRatingDisplay(parseFloat((oldRating - (delta * eased)).toFixed(2)));
      if (progress >= 1) clearInterval(timer);
    }, 50);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onStateUpdate = (data) => {
      setState(data);
      if (!ratingDropCard) setRatingDisplay(data.rating);
    };
    const onGameStarted = () => setGamePhase('running');

    const onRideRequest = (data) => {
      playPing();
      vibrate();
      setRideElapsed(0);
      setRideRequest(data);
    };

    const onRideWaiting = () => {
      setRideRequest(null);
      setTrip(null);
    };

    const onTripStarted = (data) => {
      setRideRequest(null);
      setTripElapsed(0);
      setTrip(data);
    };

    const onTripCompleted = (data) => {
      setTrip(null);
      showEarningsFlash(data.fare);
    };

    const onRideDeclined = (data) => {
      setRideRequest(null);
      if (data?.selectivityWarning) showToast(data.selectivityWarning);
    };

    const onGameEvent = (data) => {
      if (data.type === 'phantom_surge') {
        setSurgeState(data);
        return;
      }
      if (data.type === 'rating_drop') {
        animateRatingDrop(data.oldRating, data.newRating);
        setRatingDropCard(data);
        return;
      }
      if (data.type === 'quest_offer') {
        setQuestOffer(data);
        return;
      }
      if (data.type === 'deactivation_warning') {
        setLearnMoreOpen(false);
        setAppealSubmitted(false);
        setAppealText('');
      }
    };

    const onEventExpired = (data) => {
      if (data.type === 'phantom_surge') {
        setSurgeState(null);
        showToast(data.message || 'Surge has ended in your area');
      }
    };

    const onStatScreen = () => {
      setGamePhase('stat_screen');
      setRideRequest(null);
      setTrip(null);
      setSurgeState(null);
      setQuestOffer(null);
    };

    const onGameEnded = () => {
      setGamePhase('ended');
      setRideRequest(null);
      setTrip(null);
      setSurgeState(null);
      setQuestOffer(null);
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
  }, [animateRatingDrop, ratingDropCard, showEarningsFlash, showToast, socket]);

  const acceptRide = () => {
    if (!rideRequest) return;
    clearInterval(rideTimerRef.current);
    socket.emit('ride:accept', { requestId: rideRequest.requestId }, (res) => {
      if (res?.state) setState(res.state);
    });
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

  const handleQuestResponse = (accepted) => {
    socket.emit('quest:respond', { accepted }, (res) => {
      if (res?.state) setState(res.state);
      setQuestOffer(null);
    });
  };

  const handleGoOffline = () => {
    socket.emit('player:go_offline_attempt', {}, (res) => {
      if (res?.message) showToast(res.message);
      if (res?.state) setState(res.state);
    });
  };

  const dismissPayInfo = () => {
    showToast('Pay is calculated based on time, distance, demand, and other factors specific to your area.');
    socket.emit('player:dismiss_pay_info', () => {});
  };

  const submitAppeal = () => {
    setAppealSubmitted(true);
  };

  const expenses = useMemo(() => parseFloat(((state?.simulatedMiles || 0) * 0.18).toFixed(2)), [state]);
  const netEarnings = useMemo(() => parseFloat(((state?.earnings || 0) - expenses).toFixed(2)), [expenses, state]);
  const manipulationList = useMemo(
    () => (state?.mechanicsSeen || []).map((key) => ({ key, label: CITATIONS[key]?.[0], cite: CITATIONS[key]?.[1] })).filter((item) => item.label),
    [state]
  );

  if (!state) return <p style={{ padding: 20 }}>No session. <a href="/join">Join a game</a></p>;

  const tripSimRemaining = trip
    ? Math.max(0, trip.durationSeconds - ((tripElapsed / 1000) * (state.simClockRate || 8)))
    : 0;
  const goOfflineLabel = state.quest?.accepted && state.quest?.active ? 'Stop requests' : 'Go offline';
  const ratingTone = topBarTone(ratingDisplay || state.rating);
  const shownRating = (ratingDropCard ? ratingDisplay : state.rating).toFixed(2);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f6f6f4',
        color: '#111',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #f6f6f4 0%, #efefec 35%, #ecebe8 100%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', boxShadow: '0 0 0 1px rgba(255,255,255,0.3)' }}>
        <div style={{ padding: '14px 18px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
            <div>9:41</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span>5G</span>
              <span style={{ width: 18, height: 10, borderRadius: 4, border: '1.5px solid #111', display: 'inline-block', position: 'relative' }}>
                <span style={{ position: 'absolute', inset: 1.5, borderRadius: 2, background: '#111', width: '72%' }} />
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: '#70757a', textTransform: 'uppercase', letterSpacing: 1.1 }}>GigTrap Driver</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{state.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ padding: '9px 12px', borderRadius: 999, background: '#fff', border: '1px solid #e0e0e3', fontSize: 12, fontWeight: 700 }}>UberX</div>
              <div style={{ width: 42, height: 42, borderRadius: 999, background: '#111', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
                G
              </div>
            </div>
          </div>

          {state.quest?.accepted && state.quest?.active && (
            <div style={{ background: '#0d8a4a', color: '#fff', borderRadius: 22, padding: '14px 16px', marginBottom: 14, boxShadow: '0 10px 20px rgba(13,138,74,0.18)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                <span>Quest bonus</span>
                <span>{state.quest.ridesCompleted}/{state.quest.ridesRequired} rides</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.24)', marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (state.quest.ridesCompleted / state.quest.ridesRequired) * 100)}%`, background: '#fff', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
            <StatPill label="Earnings" value={formatMoney(state.earnings)} />
            <StatPill label="Rating" value={`${shownRating} ★`} tone={ratingTone} />
            <StatPill label="Rate" value={`${formatMoney(hourlyRate)}/hr`} tone={hourlyRate < 10 ? 'danger' : hourlyRate < 16 ? 'warn' : 'default'} />
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            <div style={mapChip}>Online</div>
            <div style={mapChip}>Preferences</div>
            <div style={mapChip}>Airport queue</div>
            <div style={mapChip}>Driving insights</div>
          </div>
        </div>

        <div style={{ padding: '0 18px 190px' }}>
          <div style={{ height: 3, background: '#d7d7db', borderRadius: 999, overflow: 'hidden', marginBottom: 12 }}>
            <div
              style={{
                height: '100%',
                width: `${state.strainLevel}%`,
                background: state.strainLevel >= 80 ? '#d33b31' : state.strainLevel >= 60 ? '#d59d21' : state.strainLevel >= 30 ? '#6d6f76' : '#111',
                transition: 'width 0.5s ease',
              }}
            />
          </div>

          <div style={{ position: 'relative', height: 372, borderRadius: 34, overflow: 'hidden', background: '#dddcd8', border: '1px solid #e1e1e1', boxShadow: '0 25px 50px rgba(17,17,17,0.08)' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '54px 54px' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 25% 18%, rgba(255,255,255,0.9), transparent 26%), radial-gradient(circle at 72% 70%, rgba(255,255,255,0.45), transparent 22%)' }} />
            <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.88)', borderRadius: 16, padding: '10px 12px', boxShadow: '0 12px 24px rgba(17,17,17,0.1)' }}>
              <div style={{ fontSize: 11, color: '#6c7076', textTransform: 'uppercase', letterSpacing: 1 }}>Status</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{trip ? 'Trip in progress' : 'You are online'}</div>
            </div>
            <div style={{ position: 'absolute', top: 80, left: 22, background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, boxShadow: '0 10px 24px rgba(17,17,17,0.08)' }}>Downtown</div>
            <div style={{ position: 'absolute', top: 182, right: 32, background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, boxShadow: '0 10px 24px rgba(17,17,17,0.08)' }}>Airport</div>
            <div style={{ position: 'absolute', bottom: 78, left: 30, background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700, boxShadow: '0 10px 24px rgba(17,17,17,0.08)' }}>Stadium</div>
            <div style={{ position: 'absolute', top: 54, left: 38, width: 120, height: 6, background: '#b9b9bf', transform: 'rotate(14deg)', borderRadius: 999 }} />
            <div style={{ position: 'absolute', top: 132, left: 124, width: 180, height: 6, background: '#c5c5cb', transform: 'rotate(-19deg)', borderRadius: 999 }} />
            <div style={{ position: 'absolute', top: 235, left: 54, width: 210, height: 6, background: '#c0c0c6', transform: 'rotate(10deg)', borderRadius: 999 }} />
            <div style={{ position: 'absolute', top: 146, left: '48%', width: 22, height: 22, borderRadius: 999, background: '#111', boxShadow: '0 0 0 10px rgba(17,17,17,0.08)', display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 8, height: 8, background: '#fff', borderRadius: 999 }} />
            </div>
            {surgeState && (
              <>
                <div style={{ position: 'absolute', top: '23%', left: '54%', width: 156, height: 156, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,121,44,0.7), rgba(214,55,33,0.1) 68%)', animation: 'surgePulse 1.7s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', top: 18, left: 18, right: 18, background: '#111', color: '#fff', borderRadius: 18, padding: '14px 16px', fontWeight: 600, boxShadow: '0 18px 30px rgba(17,17,17,0.18)' }}>
                  Surge pricing active. {surgeState.surgeMultiplier}x earnings in your area.
                </div>
              </>
            )}
            {trip && (
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 162, height: 162, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.92)', boxShadow: '0 20px 40px rgba(17,17,17,0.14)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#6d6f76' }}>On trip</div>
                  <div style={{ fontSize: 32, fontWeight: 700, marginTop: 6 }}>{formatClock(tripSimRemaining)}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, background: '#111', color: '#fff', borderRadius: 28, padding: '18px 18px 20px', boxShadow: '0 26px 50px rgba(17,17,17,0.12)' }}>
            {(gamePhase === 'running' || gamePhase === 'event') && !trip && !rideRequest && !state.isDeactivated && (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Current status</div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>Finding trips</div>
                <div style={{ color: '#b4b7bd', marginTop: 6 }}>Stay online to maintain priority and avoid losing momentum.</div>
                <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                  <div style={suggestionCardStyle}>
                    <div>
                      <div style={{ fontSize: 12, color: '#8f939a', textTransform: 'uppercase', letterSpacing: 1 }}>Suggested area</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Head toward downtown demand</div>
                    </div>
                    <div style={{ color: '#fff', fontWeight: 700 }}>12 min</div>
                  </div>
                  <div style={suggestionCardStyle}>
                    <div>
                      <div style={{ fontSize: 12, color: '#8f939a', textTransform: 'uppercase', letterSpacing: 1 }}>Opportunity</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>Airport pickups are busy</div>
                    </div>
                    <div style={{ color: '#fff', fontWeight: 700 }}>18 min</div>
                  </div>
                </div>
              </>
            )}

            {trip && (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Passenger onboard</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{trip.destination}</div>
                <div style={{ color: '#b4b7bd', marginTop: 6 }}>{trip.distance} • {formatMoney(trip.fare)}</div>
                <div style={{ marginTop: 14, height: 6, background: '#2a2a2d', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (tripElapsed / trip.durationMs) * 100)}%`, background: '#fff', transition: 'width 0.1s linear' }} />
                </div>
              </>
            )}

            {gamePhase === 'lobby' && (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Waiting</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>Host has not started yet</div>
              </>
            )}

            {gamePhase === 'stat_screen' && (
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Reflection</div>
                <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>How are you feeling?</div>
                <input
                  placeholder="Type your response"
                  value={statInput}
                  onChange={(e) => setStatInput(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', marginTop: 14, borderRadius: 16, border: '1px solid #2c2c31', background: '#18181a', color: '#fff', padding: '14px 16px', fontSize: 16 }}
                />
                <button onClick={submitStat} style={{ width: '100%', marginTop: 12, border: 'none', borderRadius: 16, background: '#fff', color: '#111', padding: '14px 16px', fontWeight: 700, cursor: 'pointer' }}>
                  Submit
                </button>
              </div>
            )}

            {gamePhase === 'ended' && (
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Session summary</div>
                <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{formatMoney(state.earnings)}</div>
                <div style={{ marginTop: 16, display: 'grid', gap: 8, color: '#d5d7db' }}>
                  <div>Gross earnings: <strong style={{ color: '#fff' }}>{formatMoney(state.earnings)}</strong></div>
                  <div>Net earnings: <strong style={{ color: '#fff' }}>{formatMoney(netEarnings)}</strong></div>
                  <div>Expenses: <strong style={{ color: '#fff' }}>{formatMoney(expenses)}</strong></div>
                  <div>Effective hourly: <strong style={{ color: '#fff' }}>{formatMoney(hourlyRate)}/hr</strong></div>
                  <div>Fare variance reveal: <strong style={{ color: '#fff' }}>{state.fareVariance.toFixed(2)}x</strong></div>
                  <div>Triggered mechanics: <strong style={{ color: '#fff' }}>{manipulationList.length}</strong></div>
                </div>
                {state.questHistory?.length > 0 && (
                  <div style={{ marginTop: 16, padding: 14, borderRadius: 18, background: '#18181a' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Quest math reveal</div>
                    {state.questHistory.map((quest, index) => (
                      <div key={index} style={{ color: '#d5d7db', fontSize: 14 }}>
                        Offered {formatMoney(quest.bonus)}. Hidden pay reduction clawed back {formatMoney(quest.hiddenReductionTotal)}. Bonus paid {formatMoney(quest.bonusPaid)}.
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 16, display: 'grid', gap: 6 }}>
                  {manipulationList.map((item) => (
                    <div key={item.key} style={{ color: '#d5d7db', fontSize: 14 }}>
                      {item.label} - {item.cite}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {(gamePhase === 'running' || gamePhase === 'event') && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, bottom: 0, zIndex: 6, padding: '14px 18px 22px', background: 'linear-gradient(180deg, rgba(246,246,244,0) 0%, rgba(246,246,244,0.92) 22%, #f6f6f4 100%)' }}>
            {state.showPayInfoPrompt && (
              <button
                onClick={dismissPayInfo}
                style={{ width: '100%', marginBottom: 10, border: '1px solid #d8d8dd', borderRadius: 16, background: '#fff', color: '#111', padding: '13px 15px', fontSize: 13, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}
              >
                How is my pay calculated?
              </button>
            )}
            <button
              onClick={handleGoOffline}
              style={{
                width: '100%',
                border: 'none',
                borderRadius: 18,
                background: state.strainLevel >= 60 ? '#111' : '#1f1f22',
                color: '#fff',
                padding: '16px 18px',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                animation: state.strainLevel >= 60 ? 'softPulse 1.8s ease-in-out infinite' : 'none',
              }}
            >
              {goOfflineLabel}
            </button>
            <div style={{ width: 120, height: 5, background: '#111', borderRadius: 999, margin: '16px auto 0', opacity: 0.8 }} />
          </div>
        )}
      </div>

      {earningsFlash && (
        <div style={{ position: 'fixed', top: 108, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', borderRadius: 999, padding: '10px 16px', fontWeight: 700, zIndex: 20, animation: 'flashUp 1.8s ease-out forwards' }}>
          {earningsFlash}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', left: 18, right: 18, bottom: 100, background: '#111', color: '#fff', borderRadius: 18, padding: '14px 16px', zIndex: 15, boxShadow: '0 18px 40px rgba(17,17,17,0.18)' }}>
          {toast}
        </div>
      )}

      {ratingDropCard && (
        <div style={{ position: 'fixed', left: 18, right: 18, bottom: 100, zIndex: 30, animation: 'slideUp 0.35s ease-out forwards' }}>
          <div style={{ background: '#fff', color: '#111', borderRadius: 24, padding: 18, boxShadow: '0 28px 50px rgba(17,17,17,0.18)' }}>
            <div style={{ fontSize: 12, color: '#70757a', textTransform: 'uppercase', letterSpacing: 1 }}>Rider feedback</div>
            <div style={{ fontSize: 24, margin: '8px 0 6px' }}>{'★'.repeat(ratingDropCard.reviewStars)}{'☆'.repeat(5 - ratingDropCard.reviewStars)}</div>
            <div style={{ fontWeight: 600 }}>Passenger commented: ride experience</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setRatingDropCard(null); setRatingDisplay(state.rating); }} style={{ flex: 1, border: 'none', borderRadius: 14, background: '#111', color: '#fff', padding: '14px 12px', cursor: 'pointer', fontWeight: 700 }}>
                Dismiss
              </button>
              <button disabled style={{ flex: 1, border: '1px solid #d8d8dd', borderRadius: 14, background: '#f3f3f4', color: '#a2a4a8', padding: '14px 12px', fontWeight: 700 }}>
                Contact Support
              </button>
            </div>
          </div>
        </div>
      )}

      {questOffer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 40 }}>
          <div style={{ width: '100%', maxWidth: 370, background: '#fff', borderRadius: 30, padding: 24, boxShadow: '0 35px 60px rgba(17,17,17,0.2)' }}>
            <div style={{ fontSize: 12, color: '#0d8a4a', textTransform: 'uppercase', letterSpacing: 1 }}>Opportunity</div>
            <div style={{ fontSize: 30, lineHeight: 1.05, fontWeight: 700, marginTop: 10 }}>Complete 8 more rides in the next 30 minutes and earn a $45 bonus.</div>
            <div style={{ color: '#70757a', marginTop: 12 }}>Accept to stay engaged and keep chasing the target.</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => handleQuestResponse(true)} style={{ flex: 1, border: 'none', borderRadius: 16, background: '#0d8a4a', color: '#fff', padding: '15px 12px', cursor: 'pointer', fontWeight: 700 }}>
                Accept
              </button>
              <button onClick={() => handleQuestResponse(false)} style={{ flex: 1, border: '1px solid #dbdce1', borderRadius: 16, background: '#fff', color: '#111', padding: '15px 12px', cursor: 'pointer', fontWeight: 700 }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {state.isDeactivated && (
        <div style={{ position: 'fixed', inset: 0, background: '#050505', color: '#fff', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22 }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ width: 58, height: 58, borderRadius: 16, background: '#fff', color: '#111', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 28, marginBottom: 20 }}>U</div>
            <div style={{ fontSize: 34, lineHeight: 1.02, fontWeight: 700 }}>Your account has been placed under review</div>
            <div style={{ color: '#b7b7bc', marginTop: 14, lineHeight: 1.5 }}>
              You will not receive ride requests while your account is being reviewed. This process typically takes 24-48 hours.
            </div>
            <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
              <button onClick={() => setLearnMoreOpen(true)} style={{ border: 'none', borderRadius: 18, background: '#1c1c1f', color: '#fff', padding: '15px 14px', cursor: 'pointer', fontWeight: 700 }}>
                Learn More
              </button>
              <div style={{ background: '#111214', borderRadius: 20, padding: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>Appeal</div>
                <textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} rows={5} placeholder="Tell us what happened" style={{ width: '100%', boxSizing: 'border-box', borderRadius: 16, background: '#1a1a1d', color: '#fff', border: '1px solid #2c2d31', padding: 14, resize: 'none' }} />
                <button onClick={submitAppeal} style={{ width: '100%', marginTop: 12, border: 'none', borderRadius: 16, background: '#fff', color: '#111', padding: '14px 12px', cursor: 'pointer', fontWeight: 700 }}>
                  Submit Appeal
                </button>
                {appealSubmitted && <div style={{ marginTop: 10, color: '#c8c8cc' }}>Your appeal has been received. You will be notified by email.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {learnMoreOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,5,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, zIndex: 60 }}>
          <div style={{ width: '100%', maxWidth: 390, background: '#fff', color: '#111', borderRadius: 24, padding: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 14 }}>Account review FAQ</div>
            <div style={{ color: '#4b4f55', marginBottom: 10 }}>Why was my account reviewed? Reviews are based on many signals specific to your market.</div>
            <div style={{ color: '#4b4f55', marginBottom: 10 }}>Can support explain the decision? Additional context is unavailable during active review.</div>
            <div style={{ color: '#4b4f55', marginBottom: 18 }}>How long will this take? Review timelines vary.</div>
            <button onClick={() => setLearnMoreOpen(false)} style={{ width: '100%', border: 'none', borderRadius: 16, background: '#111', color: '#fff', padding: '14px 12px', cursor: 'pointer', fontWeight: 700 }}>
              Close
            </button>
          </div>
        </div>
      )}

      {rideRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.38)', zIndex: 70, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 18 }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 32, padding: '18px 18px 22px', boxShadow: '0 30px 60px rgba(17,17,17,0.2)' }}>
            <div style={{ width: 42, height: 4, borderRadius: 999, background: '#d8d8dd', margin: '0 auto 14px' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: '#70757a', textTransform: 'uppercase', letterSpacing: 1 }}>New trip</div>
                <div style={{ fontSize: 34, fontWeight: 700, marginTop: 6 }}>{formatMoney(rideRequest.fare)}</div>
                <div style={{ color: '#43474d', marginTop: 8, fontWeight: 600 }}>{rideRequest.destination}</div>
                <div style={{ color: '#70757a', fontSize: 14, marginTop: 4 }}>{rideRequest.distance} • {Math.round(rideRequest.durationSeconds / 60)} min trip</div>
              </div>
              <CountdownArc duration={rideRequest.timeout} elapsed={rideElapsed} />
            </div>
            <button onClick={acceptRide} style={{ width: '100%', marginTop: 18, border: 'none', borderRadius: 18, background: '#111', color: '#fff', padding: '17px 16px', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}>
              Accept
            </button>
            <button onClick={declineRide} style={{ width: '100%', marginTop: 10, border: '1px solid #d8d8dd', borderRadius: 18, background: '#fff', color: '#70757a', padding: '15px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              decline
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes surgePulse {
          0%, 100% { transform: scale(0.94); opacity: 0.58; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(26px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes flashUp {
          0% { opacity: 0; transform: translateX(-50%) translateY(14px); }
          15% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-22px); }
        }
        @keyframes softPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.015); }
        }
      `}</style>
    </div>
  );
}

function topBarTone(rating) {
  if (rating < 4.6) return 'danger';
  if (rating < 4.8) return 'warn';
  return 'default';
}

const mapChip = {
  flex: '0 0 auto',
  padding: '9px 12px',
  borderRadius: 999,
  background: '#fff',
  border: '1px solid #e0e0e3',
  fontSize: 12,
  fontWeight: 700,
};

const suggestionCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  border: '1px solid #2c2d31',
  borderRadius: 18,
  padding: '14px 14px',
  background: '#17181b',
};
