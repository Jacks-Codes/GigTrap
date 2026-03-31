'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatClock(seconds) {
  const totalSeconds = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function CountdownArc({ durationMs, remainingMs, size = 120 }) {
  const safeDuration = Math.max(1, durationMs || 1);
  const clampedRemaining = Math.max(0, remainingMs || 0);
  const fraction = clampedRemaining / safeDuration;
  const angle = Math.max(0, Math.min(360, fraction * 360));
  const seconds = (clampedRemaining / 1000).toFixed(1);
  const color = fraction > 0.5 ? '#000' : fraction > 0.25 ? '#6e6e73' : '#d33b31';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        margin: '0 auto',
        background: `conic-gradient(${color} ${angle}deg, #d9d9de ${angle}deg 360deg)`,
      }}
    >
      <div
        style={{
          width: size - 16,
          height: size - 16,
          borderRadius: '50%',
          background: '#fff',
          display: 'grid',
          placeItems: 'center',
          color: '#111',
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {seconds}
      </div>
    </div>
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

function getStoredSession() {
  if (typeof window === 'undefined') return null;
  const saved = sessionStorage.getItem('gigtrap_player');
  return saved ? JSON.parse(saved) : null;
}

function getStoredRoomCode() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('gigtrap_room') || '';
}

export default function Play() {
  const [session, setSession] = useState(() => getStoredSession());
  const [payload, setPayload] = useState(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const pollTimerRef = useRef(null);
  const previousRequestRef = useRef(null);
  const phase = payload?.phase || 'lobby';

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTickNow(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session?.playerId || !session?.playerToken) return undefined;

    let cancelled = false;

    const poll = async () => {
      const roomCode = getStoredRoomCode();
      const res = await fetch(`/api/player/${session.playerId}?code=${roomCode}&token=${session.playerToken}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (cancelled || !res.ok || data.error) return;

      const previousRequestId = previousRequestRef.current;
      const currentRequestId = data.player?.pendingRequest?.requestId || null;
      if (previousRequestId && !currentRequestId && !data.player?.currentTrip && data.phase === 'running' && !submitting) {
        setToast('Request expired');
      }

      setPayload(data);
      setSession(data.player);
      setClockOffsetMs((data.serverNow || Date.now()) - Date.now());
      sessionStorage.setItem('gigtrap_player', JSON.stringify(data.player));
      previousRequestRef.current = currentRequestId;
    };

    poll();
    pollTimerRef.current = setInterval(poll, 1000);

    return () => {
      cancelled = true;
      clearInterval(pollTimerRef.current);
    };
  }, [session?.playerId, session?.playerToken, submitting]);

  if (!session) {
    return (
      <p style={{ padding: 20 }}>
        No session. <Link href="/join">Join a game</Link>
      </p>
    );
  }

  const roomCode = getStoredRoomCode();
  const currentRequest = session.pendingRequest;
  const currentTrip = session.currentTrip;
  const effectiveNow = tickNow + clockOffsetMs;
  const expenses = parseFloat(((session.simulatedMiles || 0) * 0.18).toFixed(2));
  const netEarnings = parseFloat(((session.earnings || 0) - expenses).toFixed(2));
  const requestRemainingMs = currentRequest ? Math.max(0, currentRequest.expiresAt - effectiveNow) : 0;
  const tripRemainingMs = currentTrip ? Math.max(0, currentTrip.realEndsAt - effectiveNow) : 0;
  const tripRemainingSeconds = currentTrip
    ? (tripRemainingMs / Math.max(1, currentTrip.durationMs || 1)) * currentTrip.durationSeconds
    : 0;
  const tone = session.effectiveHourlyRate < 10 ? 'danger' : session.effectiveHourlyRate < 16 ? 'warn' : 'default';

  const applyResponseState = (statePayload) => {
    if (!statePayload?.player) return;
    setPayload((prev) => ({
      ...prev,
      phase: statePayload.phase || prev?.phase || phase,
      serverNow: statePayload.serverNow || prev?.serverNow || Date.now(),
    }));
    setSession(statePayload.player);
    setClockOffsetMs((statePayload.serverNow || Date.now()) - Date.now());
    sessionStorage.setItem('gigtrap_player', JSON.stringify(statePayload.player));
  };

  const acceptRide = async () => {
    if (!currentRequest || submitting) return;
    setSubmitting(true);
    previousRequestRef.current = null;
    const res = await fetch(`/api/player/${session.playerId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: roomCode,
        token: session.playerToken,
        requestId: currentRequest.requestId,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok || data.error) {
      setToast(data.error || 'Request expired');
      return;
    }

    applyResponseState(data.state);
  };

  const declineRide = async (wasTimeout = false) => {
    if (!currentRequest || submitting) return;
    setSubmitting(true);
    previousRequestRef.current = null;
    const res = await fetch(`/api/player/${session.playerId}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: roomCode,
        token: session.playerToken,
        requestId: currentRequest.requestId,
        wasTimeout,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok || data.error) {
      setToast(data.error || 'Could not decline request');
      return;
    }

    applyResponseState(data.state);
    setToast(wasTimeout ? 'Request timed out' : 'Ride declined');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f6f4', color: '#111', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', boxShadow: '0 0 0 1px rgba(255,255,255,0.3)' }}>
        <div style={{ padding: '14px 18px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
            <div>9:41</div>
            <div>{phase.toUpperCase()}</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: '#70757a', textTransform: 'uppercase', letterSpacing: 1.1 }}>GigTrap Driver</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{session.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ padding: '9px 12px', borderRadius: 999, background: '#fff', border: '1px solid #e0e0e3', fontSize: 12, fontWeight: 700 }}>UberX</div>
              <div style={{ width: 42, height: 42, borderRadius: 999, background: '#111', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>
                G
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
            <StatPill label="Earnings" value={formatMoney(session.earnings)} />
            <StatPill label="Rating" value={`${session.rating.toFixed(2)} ★`} tone={session.rating < 4.6 ? 'danger' : session.rating < 4.8 ? 'warn' : 'default'} />
            <StatPill label="Rate" value={`${formatMoney(session.effectiveHourlyRate || 0)}/hr`} tone={tone} />
          </div>
        </div>

        <div style={{ padding: '0 18px 160px' }}>
          <div style={{ position: 'relative', height: 372, borderRadius: 34, overflow: 'hidden', background: '#deddd8', border: '1px solid #e1e1e1', boxShadow: '0 25px 50px rgba(17,17,17,0.08)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 25% 18%, rgba(255,255,255,0.9), transparent 26%), radial-gradient(circle at 72% 70%, rgba(255,255,255,0.45), transparent 22%)' }} />
            <svg viewBox="0 0 420 372" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <path d="M-20 92 C70 116, 120 144, 214 124 S356 78, 450 110" fill="none" stroke="#c3c4c8" strokeWidth="34" strokeLinecap="round" />
              <path d="M-20 92 C70 116, 120 144, 214 124 S356 78, 450 110" fill="none" stroke="#f9f9f7" strokeWidth="24" strokeLinecap="round" />
              <path d="M228 -30 C214 54, 198 110, 190 188 S176 316, 194 408" fill="none" stroke="#c8c9cd" strokeWidth="30" strokeLinecap="round" />
              <path d="M228 -30 C214 54, 198 110, 190 188 S176 316, 194 408" fill="none" stroke="#fafaf8" strokeWidth="20" strokeLinecap="round" />
              <path d="M44 276 C132 258, 210 246, 316 272 S404 304, 452 300" fill="none" stroke="#cbccd0" strokeWidth="22" strokeLinecap="round" />
              <path d="M44 276 C132 258, 210 246, 316 272 S404 304, 452 300" fill="none" stroke="#f7f7f4" strokeWidth="14" strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 72, height: 72, borderRadius: '50%', background: 'rgba(17,17,17,0.08)', display: 'grid', placeItems: 'center' }}>
              <div style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', background: '#111', boxShadow: '0 10px 24px rgba(17,17,17,0.2)' }}>
                <div style={{ position: 'absolute', left: '50%', top: -10, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '12px solid #111' }} />
                <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: '#fff' }} />
              </div>
            </div>

            {currentTrip && (
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 172, minHeight: 172, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.94)', boxShadow: '0 20px 40px rgba(17,17,17,0.14)' }}>
                <div style={{ textAlign: 'center', padding: 18 }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#6d6f76' }}>On trip</div>
                  <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{currentTrip.destination}</div>
                  <div style={{ fontSize: 14, marginTop: 6 }}>{formatClock(tripRemainingSeconds)}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, background: '#111', color: '#fff', borderRadius: 28, padding: '18px 18px 20px', boxShadow: '0 26px 50px rgba(17,17,17,0.12)' }}>
            {phase === 'lobby' && (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Waiting</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>Host has not started yet</div>
              </>
            )}

            {phase === 'stat_screen' && (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Reflection pause</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>Simulation paused</div>
                <div style={{ color: '#b4b7bd', marginTop: 6 }}>Requests, trips, and rate decay are frozen until the host resumes.</div>
              </>
            )}

            {phase === 'running' && !currentTrip && !currentRequest && (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Current status</div>
                <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>Finding trips</div>
                <div style={{ color: '#b4b7bd', marginTop: 6 }}>Stay online to maintain priority and avoid losing momentum.</div>
              </>
            )}

            {currentTrip && (
              <>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Passenger onboard</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{currentTrip.destination}</div>
                <div style={{ color: '#b4b7bd', marginTop: 6 }}>{currentTrip.distance} • {formatMoney(currentTrip.fare)}</div>
              </>
            )}

            {phase === 'ended' && (
              <div>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#b4b7bd' }}>Session summary</div>
                <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{formatMoney(session.earnings)}</div>
                <div style={{ marginTop: 16, display: 'grid', gap: 8, color: '#d5d7db' }}>
                  <div>Gross earnings: <strong style={{ color: '#fff' }}>{formatMoney(session.earnings)}</strong></div>
                  <div>Net earnings: <strong style={{ color: '#fff' }}>{formatMoney(netEarnings)}</strong></div>
                  <div>Expenses: <strong style={{ color: '#fff' }}>{formatMoney(expenses)}</strong></div>
                  <div>Effective hourly: <strong style={{ color: '#fff' }}>{formatMoney(session.effectiveHourlyRate || 0)}/hr</strong></div>
                  <div>Fare variance reveal: <strong style={{ color: '#fff' }}>{session.fareVariance.toFixed(2)}x</strong></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {phase === 'running' && currentRequest && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, bottom: 0, zIndex: 6, padding: '14px 18px 22px', background: 'linear-gradient(180deg, rgba(246,246,244,0) 0%, rgba(246,246,244,0.92) 22%, #f6f6f4 100%)' }}>
            <div style={{ background: '#fff', border: '1px solid #e0e0e3', borderRadius: 24, padding: 18, boxShadow: '0 18px 36px rgba(17,17,17,0.12)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center' }}>
                <CountdownArc durationMs={currentRequest.timeout} remainingMs={requestRemainingMs} />
                <div>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#6d6f76' }}>New request</div>
                  <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{formatMoney(currentRequest.fare)}</div>
                  <div style={{ color: '#5f6368', marginTop: 6 }}>{currentRequest.destination}</div>
                  <div style={{ color: '#5f6368', marginTop: 4 }}>{currentRequest.distance} • {formatClock(currentRequest.durationSeconds)}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => declineRide(false)}
                  disabled={submitting}
                  style={{ border: '1px solid #d8d8dd', background: '#fff', color: '#111', borderRadius: 16, padding: '15px 16px', fontWeight: 700, cursor: submitting ? 'default' : 'pointer' }}
                >
                  No
                </button>
                <button
                  onClick={acceptRide}
                  disabled={submitting}
                  style={{ border: 'none', background: '#111', color: '#fff', borderRadius: 16, padding: '15px 16px', fontWeight: 700, cursor: submitting ? 'default' : 'pointer' }}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'running' && !currentTrip && !currentRequest && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, bottom: 0, zIndex: 6, padding: '14px 18px 22px', background: 'linear-gradient(180deg, rgba(246,246,244,0) 0%, rgba(246,246,244,0.92) 22%, #f6f6f4 100%)' }}>
            <button style={{ width: '100%', border: 'none', borderRadius: 18, background: '#1f1f22', color: '#fff', padding: '16px 18px', fontSize: 16, fontWeight: 700 }}>
              Go offline
            </button>
          </div>
        )}

        {toast && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: phase === 'running' && currentRequest ? 230 : 110, width: 'calc(100% - 36px)', maxWidth: 394, background: '#111', color: '#fff', borderRadius: 16, padding: '14px 16px', zIndex: 9, boxShadow: '0 18px 36px rgba(17,17,17,0.2)' }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
