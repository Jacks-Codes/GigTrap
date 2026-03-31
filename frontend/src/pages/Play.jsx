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
  } catch {
    // audio is optional
  }
}

function vibrate() {
  try {
    navigator.vibrate?.(200);
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

function getRatingColor(rating) {
  if (rating >= 4.8) return '#62d26f';
  if (rating >= 4.6) return '#f4bf4f';
  return '#ff5a5a';
}

function calculateProjectedHourlyRate(state) {
  if (!state) return 0;

  const waitStates = new Set(['idle', 'request_pending', 'deactivated']);
  const driveStates = new Set(['on_trip']);
  let driveSeconds = state.simulatedDriveSeconds || 0;
  let waitSeconds = state.simulatedWaitSeconds || 0;

  if (state.simStateStartedAt) {
    const elapsedRealSeconds = Math.max(0, (Date.now() - state.simStateStartedAt) / 1000);
    const simDelta = elapsedRealSeconds * (state.simClockRate || 10);
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
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);
  const seconds = (remaining / 1000).toFixed(1);
  const color = fraction > 0.5 ? '#67dd74' : fraction > 0.25 ? '#ffb347' : '#ff5a5a';

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#2a2a2a" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s' }}
      />
      <text x={size / 2} y={size / 2 + 8} textAnchor="middle" fill="#fff" fontSize="28" fontWeight="bold">
        {seconds}s
      </text>
    </svg>
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
    const timer = setInterval(() => {
      setHourlyRate(calculateProjectedHourlyRate(state));
    }, 250);
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
    tripTimerRef.current = setInterval(() => {
      setTripElapsed(Date.now() - startedAt);
    }, 100);

    return () => clearInterval(tripTimerRef.current);
  }, [trip]);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const showEarningsFlash = useCallback((fare) => {
    setEarningsFlash(`+${formatMoney(fare)}`);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setEarningsFlash(null), 2000);
  }, []);

  const animateRatingDrop = useCallback((oldRating, newRating) => {
    const startedAt = Date.now();
    const duration = 1400;
    const start = oldRating;
    const delta = oldRating - newRating;

    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      const value = start - (delta * eased);
      setRatingDisplay(parseFloat(value.toFixed(2)));
      if (progress >= 1) clearInterval(timer);
    }, 50);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onStateUpdate = (data) => setState(data);
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
  }, [animateRatingDrop, showEarningsFlash, showToast, socket]);

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

  if (!state) {
    return <p style={{ padding: 20 }}>No session. <a href="/join">Join a game</a></p>;
  }

  const strainTint = state.strainLevel >= 80
    ? 'rgba(180, 0, 0, 0.22)'
    : state.strainLevel >= 60
      ? 'rgba(150, 0, 0, 0.16)'
      : state.strainLevel >= 30
        ? 'rgba(120, 20, 20, 0.1)'
        : 'transparent';

  const topBarRating = ratingDropCard ? ratingDisplay : state.rating;
  const tripSimRemaining = trip
    ? Math.max(0, trip.durationSeconds - ((tripElapsed / 1000) * (state.simClockRate || 10)))
    : 0;
  return (
    <div
      style={{
        minHeight: '100vh',
        background: `radial-gradient(circle at top, rgba(70, 70, 70, 0.15), transparent 40%), linear-gradient(${strainTint}, ${strainTint}), #0d0d0d`,
        color: '#fff',
        fontFamily: 'Georgia, Times New Roman, serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {state.strainLevel >= 80 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 80px rgba(255, 0, 0, 0.5)',
            animation: 'dangerPulse 1.8s ease-in-out infinite',
            zIndex: 2,
          }}
        />
      )}

      {earningsFlash && (
        <div
          style={{
            position: 'fixed',
            top: '14%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 48,
            fontWeight: 'bold',
            color: '#67dd74',
            animation: 'flashUp 2s ease-out forwards',
            zIndex: 1200,
            pointerEvents: 'none',
            textShadow: '0 0 24px rgba(103, 221, 116, 0.45)',
          }}
        >
          {earningsFlash}
        </div>
      )}

      {state.quest?.accepted && state.quest?.active && (
        <div style={{ padding: '10px 16px', background: '#204d2e', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            <span>Quest</span>
            <span>{state.quest.ridesCompleted}/{state.quest.ridesRequired} rides</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.15)', marginTop: 8, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, (state.quest.ridesCompleted / state.quest.ridesRequired) * 100)}%`,
                background: 'linear-gradient(90deg, #68d391, #d7ff9f)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 'bold' }}>{formatMoney(state.earnings)}</div>
          <div style={{ color: '#9d9d9d', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Gross earnings</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 21, fontWeight: 'bold', color: getRatingColor(topBarRating), transition: 'color 0.3s ease' }}>
            {topBarRating.toFixed(2)} ★
          </div>
          <div style={{ color: '#9d9d9d', fontSize: 11 }}>
            {state.acceptanceRate}% accept
          </div>
          {state.ratingCount <= 5 && (
            <div style={{ fontSize: 10, color: '#f4bf4f', marginTop: 4 }}>New driver - building rating history</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 21, fontWeight: 'bold', color: hourlyRate < 10 ? '#ff5a5a' : hourlyRate < 16 ? '#f4bf4f' : '#67dd74' }}>
            {formatMoney(hourlyRate)}/hr
          </div>
          <div style={{ color: '#9d9d9d', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Effective rate</div>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: 6 }}>
        <div style={{ height: 4, background: '#2b2b2b', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${state.strainLevel}%`,
              background: state.strainLevel >= 80 ? '#ff4d4d' : state.strainLevel >= 60 ? '#ff8f3d' : state.strainLevel >= 30 ? '#e0b44f' : '#67dd74',
              transition: 'width 0.5s ease, background 0.5s ease',
            }}
          />
        </div>
      </div>

      {state.strainLevel >= 80 && (
        <div style={{ margin: '12px 16px 0', padding: '12px 14px', background: 'rgba(110, 0, 0, 0.55)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
          You&apos;ve been driving for a long time. Take a break - but remember, you won&apos;t earn while offline.
        </div>
      )}

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '58vh', justifyContent: 'center', position: 'relative', zIndex: 3 }}>
        {gamePhase === 'lobby' && (
          <div style={{ textAlign: 'center', color: '#b0b0b0' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>Waiting for host to start</div>
            <div style={{ fontSize: 14 }}>Connected as <strong style={{ color: '#fff' }}>{state.name}</strong></div>
          </div>
        )}

        {(gamePhase === 'running' || gamePhase === 'event') && !rideRequest && !trip && !state.isDeactivated && (
          <div style={{ width: '100%', maxWidth: 360 }}>
            {surgeState ? (
              <div style={{ marginBottom: 18 }}>
                <div style={{ padding: '12px 14px', marginBottom: 14, background: 'linear-gradient(90deg, rgba(255,132,54,0.9), rgba(255,77,77,0.9))', color: '#150a05', borderRadius: 16, fontWeight: 'bold', boxShadow: '0 12px 28px rgba(255,90,40,0.25)' }}>
                  Surge pricing active - {surgeState.surgeMultiplier}x earnings in your area
                </div>
                <div style={{ height: 220, borderRadius: 22, background: 'linear-gradient(180deg, #111, #181818)', border: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
                  <div style={{ position: 'absolute', top: '26%', left: '45%', width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,132,54,0.75), rgba(255,77,77,0.05) 70%)', animation: 'surgePulse 1.6s ease-in-out infinite' }} />
                  <div style={{ position: 'absolute', left: 18, bottom: 18, color: '#ffb47d', fontWeight: 'bold' }}>{surgeState.zone}</div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div className="spinner" style={{ width: 42, height: 42, border: '3px solid #2f2f2f', borderTop: '3px solid #67dd74', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 1s linear infinite' }} />
                <div style={{ fontSize: 17, color: '#bbbbbb' }}>Searching for ride requests</div>
                <div style={{ marginTop: 10, fontSize: 38, fontWeight: 'bold', color: hourlyRate < 10 ? '#ff5a5a' : '#bcbcbc' }}>
                  {formatMoney(hourlyRate)}/hr
                </div>
                <div style={{ color: '#7f7f7f', fontSize: 12, marginTop: 4 }}>Every second waiting is diluting your rate</div>
              </div>
            )}
          </div>
        )}

        {trip && (
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 340, background: 'rgba(255,255,255,0.03)', padding: 24, borderRadius: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 13, color: '#67dd74', marginBottom: 8, letterSpacing: 2, textTransform: 'uppercase' }}>On Trip</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 6 }}>{trip.destination}</div>
            <div style={{ color: '#9d9d9d', marginBottom: 18 }}>{trip.distance}</div>
            <div style={{ height: 6, background: '#2c2c2c', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ height: '100%', width: `${Math.min(100, (tripElapsed / trip.durationMs) * 100)}%`, background: 'linear-gradient(90deg, #67dd74, #d7ff9f)', transition: 'width 0.1s linear' }} />
            </div>
            <div style={{ fontSize: 30, fontWeight: 'bold' }}>{formatMoney(trip.fare)}</div>
            <div style={{ color: '#999', marginTop: 8 }}>Passenger onboard</div>
            <div style={{ color: '#d7ff9f', fontSize: 14, marginTop: 4 }}>{formatClock(tripSimRemaining)} simulated remaining</div>
          </div>
        )}

        {gamePhase === 'stat_screen' && (
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 340 }}>
            <div style={{ fontSize: 18, marginBottom: 12 }}>How are you feeling?</div>
            <input
              placeholder="Your answer..."
              value={statInput}
              onChange={(e) => setStatInput(e.target.value)}
              style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 10, border: '1px solid #555', background: '#181818', color: '#fff', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <button onClick={submitStat} style={{ width: '100%', padding: 12, fontSize: 16, borderRadius: 10, background: '#67dd74', color: '#081408', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
              Submit
            </button>
          </div>
        )}

        {gamePhase === 'ended' && (
          <div style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 22 }}>
            <div style={{ fontSize: 12, color: '#9d9d9d', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>Session Complete</div>
            <div style={{ fontSize: 34, fontWeight: 'bold' }}>{formatMoney(state.earnings)}</div>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <div>Gross earnings: <strong>{formatMoney(state.earnings)}</strong></div>
              <div>Net earnings after expenses: <strong>{formatMoney(netEarnings)}</strong></div>
              <div>Gas deduction at $0.18/sim mile: <strong>{formatMoney(expenses)}</strong></div>
              <div>Effective hourly rate: <strong>{formatMoney(hourlyRate)}/hr</strong></div>
              <div>Fare variance reveal: <strong>{state.fareVariance.toFixed(2)}x</strong></div>
              <div>Manipulation mechanics triggered: <strong>{manipulationList.length}</strong></div>
            </div>

            {state.questHistory?.length > 0 && (
              <div style={{ marginTop: 18, padding: 14, borderRadius: 16, background: 'rgba(55, 90, 45, 0.28)' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Quest math reveal</div>
                {state.questHistory.map((quest, index) => (
                  <div key={index} style={{ color: '#d7d7d7', fontSize: 14 }}>
                    Bonus offered {formatMoney(quest.bonus)}. Hidden fare suppression clawed back {formatMoney(quest.hiddenReductionTotal)}. Bonus paid {formatMoney(quest.bonusPaid)}.
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Mechanics you experienced</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {manipulationList.map((item) => (
                  <div key={item.key} style={{ fontSize: 14, color: '#d1d1d1' }}>
                    {item.label} - {item.cite}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {(gamePhase === 'running' || gamePhase === 'event') && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 18, zIndex: 40 }}>
          {state.showPayInfoPrompt && (
            <button
              onClick={dismissPayInfo}
              style={{
                marginBottom: 10,
                background: 'rgba(255,255,255,0.06)',
                color: '#cfcfcf',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 999,
                padding: '10px 14px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              How is my pay calculated?
            </button>
          )}

          <button
            onClick={handleGoOffline}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 16,
              padding: '15px 16px',
              fontSize: 16,
              fontWeight: 'bold',
              cursor: 'pointer',
              color: '#fff',
              background: state.strainLevel >= 60 ? '#6b1f1f' : '#2e2e2e',
              animation: state.strainLevel >= 60 ? 'buttonPulse 1.8s ease-in-out infinite' : 'none',
            }}
          >
            Go Offline
          </button>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 92, background: 'rgba(25,25,25,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '12px 14px', zIndex: 50, boxShadow: '0 18px 40px rgba(0,0,0,0.32)' }}>
          {toast}
        </div>
      )}

      {ratingDropCard && (
        <div style={{ position: 'fixed', left: 16, right: 16, bottom: 18, zIndex: 70, animation: 'slideUp 0.4s ease-out forwards' }}>
          <div style={{ background: '#f3efe8', color: '#141414', borderRadius: 18, padding: 16, boxShadow: '0 22px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#6d655c' }}>Customer review</div>
            <div style={{ fontSize: 22, margin: '6px 0' }}>{'★'.repeat(ratingDropCard.reviewStars)}{'☆'.repeat(5 - ratingDropCard.reviewStars)}</div>
            <div style={{ marginBottom: 14 }}>Passenger commented: ride experience</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRatingDropCard(null)} style={{ flex: 1, border: 'none', borderRadius: 12, padding: '12px 10px', background: '#141414', color: '#fff', cursor: 'pointer' }}>Dismiss</button>
              <button disabled style={{ flex: 1, border: 'none', borderRadius: 12, padding: '12px 10px', background: '#cbc7c0', color: '#7c776f' }}>Contact Support</button>
            </div>
          </div>
        </div>
      )}

      {questOffer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6, 18, 6, 0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 80 }}>
          <div style={{ width: '100%', maxWidth: 360, borderRadius: 24, padding: 24, background: 'linear-gradient(180deg, #1f4d2e, #173a22)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 24px 50px rgba(0,0,0,0.35)' }}>
            <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 2, color: '#b8e8c2', marginBottom: 10 }}>Limited time quest</div>
            <div style={{ fontSize: 30, fontWeight: 'bold', marginBottom: 10 }}>Complete 8 more rides in the next 30 minutes and earn a $45 bonus!</div>
            <div style={{ color: '#d8e7db', marginBottom: 18 }}>Stay online. Keep momentum. Do not lose your streak.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleQuestResponse(true)} style={{ flex: 1, border: 'none', borderRadius: 14, padding: '14px 10px', background: '#8ae39c', color: '#0e1d12', cursor: 'pointer', fontWeight: 'bold' }}>Accept</button>
              <button onClick={() => handleQuestResponse(false)} style={{ flex: 1, border: 'none', borderRadius: 14, padding: '14px 10px', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer' }}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {state.isDeactivated && (
        <div style={{ position: 'fixed', inset: 0, background: '#040404', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 90 }}>
          <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
            <div style={{ fontSize: 42, fontWeight: 'bold', marginBottom: 12 }}>gigtrap</div>
            <div style={{ fontSize: 28, fontWeight: 'bold', marginBottom: 10 }}>Your account has been placed under review</div>
            <div style={{ color: '#a9a9a9', lineHeight: 1.5, marginBottom: 24 }}>
              You will not receive ride requests while your account is being reviewed. This process typically takes 24-48 hours.
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button onClick={() => setLearnMoreOpen(true)} style={{ border: 'none', borderRadius: 14, padding: '14px 12px', background: '#1c1c1c', color: '#fff', cursor: 'pointer' }}>Learn More</button>
              <div style={{ background: '#111', borderRadius: 16, padding: 14, textAlign: 'left' }}>
                <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Appeal</div>
                <textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} rows={5} placeholder="Tell us what happened" style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, background: '#181818', color: '#fff', border: '1px solid #2f2f2f', padding: 12, resize: 'none' }} />
                <button onClick={submitAppeal} style={{ width: '100%', marginTop: 10, border: 'none', borderRadius: 12, padding: '12px 10px', background: '#f5f5f5', color: '#111', cursor: 'pointer', fontWeight: 'bold' }}>Submit Appeal</button>
                {appealSubmitted && <div style={{ marginTop: 10, color: '#c0c0c0' }}>Your appeal has been received. You will be notified by email.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {learnMoreOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}>
          <div style={{ width: '100%', maxWidth: 380, borderRadius: 20, padding: 20, background: '#111', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>Account review FAQ</div>
            <div style={{ marginBottom: 10, color: '#d1d1d1' }}>Why was my account reviewed? Review decisions are based on many factors specific to your market.</div>
            <div style={{ marginBottom: 10, color: '#d1d1d1' }}>Can support explain the decision? Our team is unable to provide additional context during active review.</div>
            <div style={{ marginBottom: 16, color: '#d1d1d1' }}>How long will this take? Review timelines vary.</div>
            <button onClick={() => setLearnMoreOpen(false)} style={{ width: '100%', border: 'none', borderRadius: 12, padding: '12px 10px', background: '#f5f5f5', color: '#111', cursor: 'pointer', fontWeight: 'bold' }}>Close</button>
          </div>
        </div>
      )}

      {rideRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 24 }}>
          <div style={{ background: '#171717', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 28px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: 12, color: '#9d9d9d', marginBottom: 8, letterSpacing: 1.5 }}>RIDE REQUEST</div>
            <CountdownArc duration={rideRequest.timeout} elapsed={rideElapsed} />
            <div style={{ fontSize: 38, fontWeight: 'bold', margin: '16px 0 6px', color: '#fff' }}>{formatMoney(rideRequest.fare)}</div>
            <div style={{ color: '#dadada', fontSize: 15, marginBottom: 4 }}>{rideRequest.destination}</div>
            <div style={{ color: '#8b8b8b', fontSize: 12, marginBottom: 22 }}>{rideRequest.distance} • {Math.round(rideRequest.durationSeconds / 60)} min trip</div>
            <button onClick={acceptRide} style={{ width: '100%', padding: '18px 0', fontSize: 22, fontWeight: 'bold', background: '#67dd74', color: '#102013', border: 'none', borderRadius: 16, cursor: 'pointer', marginBottom: 12, boxShadow: '0 0 20px rgba(103,221,116,0.3)', animation: 'buttonPulse 1.5s ease-in-out infinite' }}>Accept</button>
            <button onClick={declineRide} style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer', padding: '4px 8px' }}>decline</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes flashUp {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-60px); }
        }
        @keyframes surgePulse {
          0%, 100% { transform: scale(0.92); opacity: 0.55; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(120%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes buttonPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 18px rgba(103,221,116,0.22); }
          50% { transform: scale(1.02); box-shadow: 0 0 26px rgba(103,221,116,0.38); }
        }
        @keyframes dangerPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
