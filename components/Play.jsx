'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const TIER_LEVELS = [
  { name: 'Blue', minRides: 0, minAcceptance: 0, color: '#3b82f6' },
  { name: 'Gold', minRides: 15, minAcceptance: 85, color: '#d4a017' },
  { name: 'Platinum', minRides: 30, minAcceptance: 90, color: '#8b95a5' },
  { name: 'Diamond', minRides: 50, minAcceptance: 95, color: '#60c5e8' },
];

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

function FakeRideshareBackdrop() {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(145deg, #f7f7f2 0%, #eef3ed 42%, #f1efe9 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.42, backgroundImage: 'linear-gradient(rgba(17,17,17,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,17,0.06) 1px, transparent 1px)', backgroundSize: '42px 42px', transform: 'rotate(-2deg) scale(1.08)' }} />
      <div style={{ position: 'absolute', top: 54, right: -72, width: 330, height: 330, border: '34px solid rgba(17,17,17,0.08)', borderRadius: 52, transform: 'rotate(-14deg)' }} />
      <div style={{ position: 'absolute', top: 86, right: -24, color: 'rgba(17,17,17,0.1)', fontSize: 92, lineHeight: 0.86, fontWeight: 900, textTransform: 'uppercase', transform: 'rotate(-14deg)', fontFamily: 'Arial Black, Impact, system-ui, sans-serif' }}>
        U8ER
      </div>
      <div style={{ position: 'absolute', left: -34, bottom: 132, width: 168, height: 168, background: 'rgba(17,17,17,0.07)', borderRadius: 38, transform: 'rotate(17deg)', display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 84, height: 84, border: '18px solid rgba(17,17,17,0.16)', borderTopColor: 'transparent', borderRadius: 24 }} />
      </div>
      <div style={{ position: 'absolute', left: '8%', top: '26%', color: 'rgba(17,17,17,0.08)', fontSize: 42, fontWeight: 900, textTransform: 'uppercase', transform: 'rotate(8deg)' }}>
        UBR
      </div>
      <div style={{ position: 'absolute', right: '10%', bottom: '11%', color: 'rgba(13,138,74,0.14)', fontSize: 46, fontWeight: 900, textTransform: 'uppercase', transform: 'rotate(-8deg)' }}>
        UBRPOOL
      </div>
      <div style={{ position: 'absolute', left: '13%', bottom: '5%', right: '13%', height: 9, borderRadius: 999, background: 'linear-gradient(90deg, rgba(17,17,17,0), rgba(17,17,17,0.12), rgba(13,138,74,0.18), rgba(17,17,17,0))' }} />
    </div>
  );
}

function topBarTone(rating) {
  if (rating < 4.6) return 'danger';
  if (rating < 4.8) return 'warn';
  return 'default';
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
  const [sessionError, setSessionError] = useState(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [toast, setToast] = useState(null);
  const [fareToast, setFareToast] = useState(null);
  const [ratingDisplay, setRatingDisplay] = useState(() => getStoredSession()?.rating || 5);
  const [surgeState, setSurgeState] = useState(null);
  const [ratingDropCard, setRatingDropCard] = useState(null);
  const [maintenanceFeeCard, setMaintenanceFeeCard] = useState(null);
  const [questOffer, setQuestOffer] = useState(null);
  const [quizPrompt, setQuizPrompt] = useState(null);
  const [maintenanceFeeModal, setMaintenanceFeeModal] = useState(null);
  const [promoPopup, setPromoPopup] = useState(null);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [appealSubmitted, setAppealSubmitted] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollTimerRef = useRef(null);
  const previousRequestRef = useRef(null);
  const lastCompletionRef = useRef(null);
  const lastSurgeRef = useRef(null);
  const lastQuestRef = useRef(null);
  const lastRatingDropRef = useRef(null);
  const lastMaintenanceFeeCardRef = useRef(null);
  const lastQuizRef = useRef(null);
  const lastMaintenanceFeeRef = useRef(null);
  const lastTierRef = useRef(null);
  const lastPromoRef = useRef(null);
  const phase = payload?.phase || 'lobby';

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!fareToast) return undefined;
    const timer = setTimeout(() => setFareToast(null), 3200);
    return () => clearTimeout(timer);
  }, [fareToast]);

  useEffect(() => {
    if (!surgeState?.expiresAt) return undefined;
    const remaining = Math.max(0, surgeState.expiresAt - (Date.now() + clockOffsetMs));
    const timer = setTimeout(() => {
      setSurgeState(null);
      setToast('Surge has ended in your area');
    }, remaining);
    return () => clearTimeout(timer);
  }, [clockOffsetMs, surgeState]);

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
      if (cancelled) return;
      if (!res.ok || data.error) {
        if (res.status === 404) {
          setSessionError('Your session was lost. Rejoin the room.');
          clearInterval(pollTimerRef.current);
        }
        return;
      }

      const previousRequestId = previousRequestRef.current;
      const currentRequestId = data.player?.pendingRequest?.requestId || null;
      if (previousRequestId && !currentRequestId && !data.player?.currentTrip && data.phase === 'running' && !submitting) {
        setToast('Request expired');
      }

      const completionStamp = data.player?.lastTripCompletedAt || null;
      if (completionStamp && completionStamp !== lastCompletionRef.current) {
        setFareToast(`Trip complete • ${formatMoney(data.player?.lastTripPayout || 0)}`);
      }

      const surgeEventId = data.player?.activeSurge?.eventId || null;
      if (surgeEventId && surgeEventId !== lastSurgeRef.current) {
        setSurgeState(data.player.activeSurge);
      } else if (!surgeEventId) {
        setSurgeState(null);
      }

      const questEventId = data.player?.pendingQuestOffer?.eventId || null;
      if (questEventId && questEventId !== lastQuestRef.current) {
        setQuestOffer(data.player.pendingQuestOffer);
      } else if (!questEventId) {
        setQuestOffer(null);
      }

      const ratingEventId = data.player?.latestRatingDrop?.eventId || null;
      if (ratingEventId && ratingEventId !== lastRatingDropRef.current) {
        const drop = data.player.latestRatingDrop;
        setRatingDropCard(drop);
        const start = drop.oldRating;
        const end = drop.newRating;
        const startedAt = Date.now();
        const animation = setInterval(() => {
          const elapsed = Date.now() - startedAt;
          const progress = Math.min(1, elapsed / 1400);
          const current = start + ((end - start) * progress);
          setRatingDisplay(parseFloat(current.toFixed(2)));
          if (progress >= 1) {
            clearInterval(animation);
          }
        }, 50);
        setTimeout(() => clearInterval(animation), 1600);
      } else if (!ratingDropCard && data.player?.rating) {
        setRatingDisplay(data.player.rating);
      }

      const maintenanceEventId = data.player?.latestMaintenanceFee?.eventId || null;
      if (maintenanceEventId && maintenanceEventId !== lastMaintenanceFeeCardRef.current) {
        setMaintenanceFeeCard(data.player.latestMaintenanceFee);
      }

      const quizEventId = data.player?.activeQuiz?.quizId || null;
      if (quizEventId && quizEventId !== lastQuizRef.current) {
        setQuizPrompt(data.player.activeQuiz);
      } else if (!quizEventId) {
        setQuizPrompt(null);
      }

      const maintEventId = data.player?.pendingMaintenanceFee?.eventId || null;
      if (maintEventId && maintEventId !== lastMaintenanceFeeRef.current) {
        setMaintenanceFeeModal(data.player.pendingMaintenanceFee);
      } else if (!maintEventId) {
        setMaintenanceFeeModal(null);
      }

      const promoId = data.player?.activePromo?.promoId || null;
      if (promoId && promoId !== lastPromoRef.current) {
        setPromoPopup(data.player.activePromo);
      } else if (!promoId) {
        setPromoPopup(null);
      }

      const currentTierIndex = data.player?.tierIndex ?? 0;
      if (lastTierRef.current !== null && currentTierIndex < lastTierRef.current) {
        setToast(`Tier demoted to ${data.player.tierName}. Your acceptance rate dropped below the threshold.`);
      }

      setPayload(data);
      setSession(data.player);
      setClockOffsetMs((data.serverNow || Date.now()) - Date.now());
      sessionStorage.setItem('gigtrap_player', JSON.stringify(data.player));
      previousRequestRef.current = currentRequestId;
      lastCompletionRef.current = completionStamp;
      lastSurgeRef.current = surgeEventId;
      lastQuestRef.current = questEventId;
      lastRatingDropRef.current = ratingEventId;
      lastMaintenanceFeeCardRef.current = maintenanceEventId;
      lastQuizRef.current = quizEventId;
      lastMaintenanceFeeRef.current = maintEventId;
      lastPromoRef.current = promoId;
      lastTierRef.current = currentTierIndex;
    };

    poll();
    pollTimerRef.current = setInterval(poll, 1000);

    return () => {
      cancelled = true;
      clearInterval(pollTimerRef.current);
    };
  }, [ratingDropCard, session?.playerId, session?.playerToken, submitting]);

  const roomCode = getStoredRoomCode();
  const currentRequest = session?.pendingRequest;
  const currentTrip = session?.currentTrip;
  const effectiveNow = tickNow + clockOffsetMs;
  const expenses = parseFloat((((session?.simulatedMiles) || 0) * 0.18).toFixed(2));
  const netEarnings = parseFloat((((session?.earnings) || 0) - expenses).toFixed(2));
  const requestRemainingMs = currentRequest ? Math.max(0, currentRequest.expiresAt - effectiveNow) : 0;
  const activeRequest = currentRequest && requestRemainingMs > 0 ? currentRequest : null;
  const tripRemainingMs = currentTrip ? Math.max(0, currentTrip.realEndsAt - effectiveNow) : 0;
  const tripRemainingSeconds = currentTrip
    ? (tripRemainingMs / Math.max(1, currentTrip.durationMs || 1)) * currentTrip.durationSeconds
    : 0;
  const tone = (session?.effectiveHourlyRate || 0) < 10 ? 'danger' : (session?.effectiveHourlyRate || 0) < 16 ? 'warn' : 'default';
  const ratingTone = topBarTone(ratingDropCard ? ratingDisplay : (session?.rating || 5));
  const shownRating = (ratingDropCard ? ratingDisplay : (session?.rating || 5)).toFixed(2);

  const clearLocalRequest = () => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, pendingRequest: null };
      sessionStorage.setItem('gigtrap_player', JSON.stringify(next));
      return next;
    });
    previousRequestRef.current = null;
  };

  if (!session) {
    return (
      <p style={{ padding: 20 }}>
        No session. <Link href="/join">Join a game</Link>
      </p>
    );
  }

  const applyResponseState = (statePayload) => {
    if (!statePayload?.player) return;
    const serverNow = statePayload.serverNow ?? payload?.serverNow ?? tickNow;
    setPayload((prev) => ({
      ...prev,
      phase: statePayload.phase || prev?.phase || phase,
      serverNow,
    }));
    setSession(statePayload.player);
    setClockOffsetMs(serverNow - tickNow);
    sessionStorage.setItem('gigtrap_player', JSON.stringify(statePayload.player));
  };

  const acceptRide = async () => {
    if (!activeRequest || submitting) return;
    setSubmitting(true);
    clearLocalRequest();
    const res = await fetch(`/api/player/${session.playerId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: roomCode,
        token: session.playerToken,
        requestId: activeRequest.requestId,
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
    if (!activeRequest || submitting) return;
    setSubmitting(true);
    clearLocalRequest();
    const res = await fetch(`/api/player/${session.playerId}/decline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: roomCode,
        token: session.playerToken,
        requestId: activeRequest.requestId,
        wasTimeout,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!res.ok || data.error) {
      setToast(data.error || (wasTimeout ? 'Request timed out' : 'Request expired'));
      return;
    }

    applyResponseState(data.state);
    setToast(wasTimeout ? 'Request timed out' : 'Ride declined');
  };

  const handleQuestResponse = async (accepted) => {
    if (submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/player/${session.playerId}/quest-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: roomCode,
        token: session.playerToken,
        accepted,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok || data.error) {
      setToast(data.error || 'Could not respond to quest');
      return;
    }
    setQuestOffer(null);
    applyResponseState(data.state);
  };

  const answerQuestion = async (selectedIndex) => {
    if (!quizPrompt || submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/player/${session.playerId}/answer-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: roomCode,
        token: session.playerToken,
        selectedIndex,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok || data.error) {
      setToast(data.error || 'Could not submit answer');
      return;
    }
    setQuizPrompt(null);
    applyResponseState(data.state);
    setToast(data.correct ? `Correct. +${formatMoney(data.reward)} and a rating bump.` : 'Wrong. Rating decreased.');
  };

  const dismissPromo = async () => {
    if (submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/player/${session.playerId}/dismiss-promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, token: session.playerToken }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok || data.error) return;
    setPromoPopup(null);
    lastPromoRef.current = null;
    applyResponseState(data.state);
  };

  const acknowledgeMaintenanceFee = async () => {
    if (submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/player/${session.playerId}/acknowledge-maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: roomCode, token: session.playerToken }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok || data.error) return;
    setMaintenanceFeeModal(null);
    lastMaintenanceFeeRef.current = null;
    applyResponseState(data.state);
  };

  const handleGoOffline = async () => {
    if (submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/player/${session.playerId}/go-offline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: roomCode,
        token: session.playerToken,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok || data.error) {
      setToast(data.error || 'Could not go offline');
      return;
    }
    applyResponseState(data.state);
    if (data.message) {
      setToast(data.message);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f6f6f4', color: '#111', position: 'relative', overflow: 'hidden' }}>
      <FakeRideshareBackdrop />
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
            <StatPill label="Rating" value={`${shownRating} ★`} tone={ratingTone} />
            <StatPill label="Rate" value={`${formatMoney(session.effectiveHourlyRate || 0)}/hr`} tone={tone} />
          </div>

          {(() => {
            const tierIndex = session.tierIndex ?? 0;
            const tier = TIER_LEVELS[tierIndex];
            const nextTier = TIER_LEVELS[tierIndex + 1];
            const ridesProgress = nextTier ? Math.min(100, (session.ridesCompleted / nextTier.minRides) * 100) : 100;
            const acceptanceProgress = nextTier ? Math.min(100, (session.acceptanceRate / nextTier.minAcceptance) * 100) : 100;
            return (
              <div style={{ background: '#fff', border: '1px solid #e7e7ea', borderRadius: 22, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: tier.color }} />
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{tier.name} Tier</span>
                  </div>
                  {nextTier && (
                    <span style={{ fontSize: 11, color: '#70757a' }}>
                      Next: {nextTier.name} ({nextTier.minRides} rides, {nextTier.minAcceptance}%)
                    </span>
                  )}
                  {!nextTier && (
                    <span style={{ fontSize: 11, color: '#70757a' }}>Max tier</span>
                  )}
                </div>
                {nextTier && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#70757a', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Rides {session.ridesCompleted}/{nextTier.minRides}</div>
                      <div style={{ height: 6, borderRadius: 999, background: '#ededf0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${ridesProgress}%`, background: tier.color, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#70757a', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Accept {session.acceptanceRate}%/{nextTier.minAcceptance}%</div>
                      <div style={{ height: 6, borderRadius: 999, background: '#ededf0', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${acceptanceProgress}%`, background: acceptanceProgress >= 100 ? tier.color : '#d59d21', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {session.quest?.accepted && session.quest?.active && (
            <div style={{ background: '#0d8a4a', color: '#fff', borderRadius: 22, padding: '14px 16px', marginBottom: 12, boxShadow: '0 10px 20px rgba(13,138,74,0.18)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                <span>Quest bonus</span>
                <span>{session.quest.ridesCompleted}/{session.quest.ridesRequired} rides</span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.24)', marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (session.quest.ridesCompleted / session.quest.ridesRequired) * 100)}%`, background: '#fff', transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}
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

            {surgeState && (
              <>
                <div style={{ position: 'absolute', top: '23%', left: '54%', width: 156, height: 156, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,121,44,0.7), rgba(214,55,33,0.1) 68%)', animation: 'surgePulse 1.7s ease-in-out infinite' }} />
                <div style={{ position: 'absolute', top: 18, left: 18, right: 18, background: '#111', color: '#fff', borderRadius: 18, padding: '14px 16px', fontWeight: 600, boxShadow: '0 18px 30px rgba(17,17,17,0.18)' }}>
                  Surge pricing active. {surgeState.surgeMultiplier}x earnings in your area.
                </div>
              </>
            )}

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
                <div style={{ marginTop: 14, height: 6, background: '#2a2a2d', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, ((currentTrip.durationMs - tripRemainingMs) / Math.max(1, currentTrip.durationMs)) * 100)}%`, background: '#fff', transition: 'width 0.2s linear' }} />
                </div>
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

        {phase === 'running' && activeRequest && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, bottom: 0, zIndex: 6, padding: '14px 18px 22px', background: 'linear-gradient(180deg, rgba(246,246,244,0) 0%, rgba(246,246,244,0.92) 22%, #f6f6f4 100%)' }}>
            <div style={{ background: '#fff', border: '1px solid #e0e0e3', borderRadius: 24, padding: 18, boxShadow: '0 18px 36px rgba(17,17,17,0.12)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16, alignItems: 'center' }}>
                <CountdownArc durationMs={activeRequest.timeout} remainingMs={requestRemainingMs} />
                <div>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: '#6d6f76' }}>New request</div>
                  <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{formatMoney(activeRequest.fare)}</div>
                  <div style={{ color: '#5f6368', marginTop: 6 }}>{activeRequest.destination}</div>
                  <div style={{ color: '#5f6368', marginTop: 4 }}>{activeRequest.distance} • {formatClock(activeRequest.durationSeconds)}</div>
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

        {phase === 'running' && !currentTrip && !activeRequest && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, bottom: 0, zIndex: 6, padding: '14px 18px 22px', background: 'linear-gradient(180deg, rgba(246,246,244,0) 0%, rgba(246,246,244,0.92) 22%, #f6f6f4 100%)' }}>
            <button onClick={handleGoOffline} style={{ width: '100%', border: 'none', borderRadius: 18, background: '#1f1f22', color: '#fff', padding: '16px 18px', fontSize: 16, fontWeight: 700 }}>
              Go offline
            </button>
          </div>
        )}

        {toast && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: phase === 'running' && activeRequest ? 230 : 110, width: 'calc(100% - 36px)', maxWidth: 394, background: '#111', color: '#fff', borderRadius: 16, padding: '14px 16px', zIndex: 9, boxShadow: '0 18px 36px rgba(17,17,17,0.2)' }}>
            {toast}
          </div>
        )}

        {sessionError && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 168, width: 'calc(100% - 36px)', maxWidth: 394, background: '#b42318', color: '#fff', borderRadius: 16, padding: '14px 16px', zIndex: 9, boxShadow: '0 18px 36px rgba(17,17,17,0.2)', fontWeight: 700 }}>
            {sessionError}
          </div>
        )}

        {fareToast && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: phase === 'running' && activeRequest ? 296 : 168, width: 'calc(100% - 36px)', maxWidth: 394, background: '#12a150', color: '#fff', borderRadius: 16, padding: '14px 16px', zIndex: 9, boxShadow: '0 18px 36px rgba(17,17,17,0.2)', fontWeight: 700 }}>
            {fareToast}
          </div>
        )}

        {ratingDropCard && (
          <div style={{ position: 'fixed', left: 18, right: 18, bottom: 100, zIndex: 30, animation: 'slideUp 0.35s ease-out forwards' }}>
            <div style={{ background: '#fff', color: '#111', borderRadius: 24, padding: 18, boxShadow: '0 28px 50px rgba(17,17,17,0.18)' }}>
              <div style={{ fontSize: 12, color: '#70757a', textTransform: 'uppercase', letterSpacing: 1 }}>Rider feedback</div>
              <div style={{ fontSize: 24, margin: '8px 0 6px' }}>{'★'.repeat(ratingDropCard.reviewStars)}{'☆'.repeat(5 - ratingDropCard.reviewStars)}</div>
              <div style={{ fontWeight: 600 }}>{ratingDropCard.reviewText}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button onClick={() => { setRatingDropCard(null); setRatingDisplay(session.rating); }} style={{ flex: 1, border: 'none', borderRadius: 14, background: '#111', color: '#fff', padding: '14px 12px', cursor: 'pointer', fontWeight: 700 }}>
                  Dismiss
                </button>
                <button disabled style={{ flex: 1, border: '1px solid #d8d8dd', borderRadius: 14, background: '#f3f3f4', color: '#a2a4a8', padding: '14px 12px', fontWeight: 700 }}>
                  Contact Support
                </button>
              </div>
            </div>
          </div>
        )}

        {maintenanceFeeCard && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 41 }}>
            <div style={{ width: '100%', maxWidth: 380, background: '#fff', color: '#111', borderRadius: 28, padding: 24, boxShadow: '0 35px 60px rgba(17,17,17,0.22)' }}>
              <div style={{ fontSize: 12, color: '#b4321f', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Vehicle alert</div>
              <div style={{ fontSize: 28, lineHeight: 1.05, fontWeight: 700, marginTop: 10 }}>Maintenance fee charged</div>
              <div style={{ marginTop: 14, fontSize: 44, fontWeight: 800, color: '#b4321f' }}>-{formatMoney(maintenanceFeeCard.amount)}</div>
              <div style={{ color: '#5f6368', marginTop: 10, lineHeight: 1.45 }}>
                {maintenanceFeeCard.reason}. The cost has been deducted from your earnings. Your account may show a negative balance until you complete more rides.
              </div>
              <button
                onClick={() => setMaintenanceFeeCard(null)}
                style={{ width: '100%', marginTop: 20, border: 'none', borderRadius: 16, background: '#111', color: '#fff', padding: '15px 12px', cursor: 'pointer', fontWeight: 700 }}
              >
                Acknowledge
              </button>
            </div>
          </div>
        )}

        {questOffer && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 40 }}>
            <div style={{ width: '100%', maxWidth: 370, background: '#fff', borderRadius: 30, padding: 24, boxShadow: '0 35px 60px rgba(17,17,17,0.2)' }}>
              <div style={{ fontSize: 12, color: '#0d8a4a', textTransform: 'uppercase', letterSpacing: 1 }}>Opportunity</div>
              <div style={{ fontSize: 30, lineHeight: 1.05, fontWeight: 700, marginTop: 10 }}>Complete {questOffer.ridesRequired} more rides in the next 30 minutes and earn a ${questOffer.bonus} bonus.</div>
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

        {quizPrompt && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 42 }}>
            <div style={{ width: '100%', maxWidth: 390, background: '#fff', borderRadius: 30, padding: 24, boxShadow: '0 35px 60px rgba(17,17,17,0.2)' }}>
              <div style={{ fontSize: 12, color: '#111', textTransform: 'uppercase', letterSpacing: 1 }}>Quick check-in</div>
              <div style={{ fontSize: 30, lineHeight: 1.08, fontWeight: 700, marginTop: 10 }}>{quizPrompt.prompt}</div>
              <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
                {quizPrompt.options.map((option, index) => (
                  <button key={option} onClick={() => answerQuestion(index)} style={{ width: '100%', border: '1px solid #dbdce1', borderRadius: 16, background: '#fff', color: '#111', padding: '15px 14px', cursor: 'pointer', fontWeight: 700, textAlign: 'left' }}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {session.isDeactivated && (
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
                  <button onClick={() => setAppealSubmitted(true)} style={{ width: '100%', marginTop: 12, border: 'none', borderRadius: 16, background: '#fff', color: '#111', padding: '14px 12px', cursor: 'pointer', fontWeight: 700 }}>
                    Submit Appeal
                  </button>
                  {appealSubmitted && <div style={{ marginTop: 10, color: '#c8c8cc' }}>Your appeal has been received. You will be notified by email.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {promoPopup && (
          <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: phase === 'running' && activeRequest ? 230 : 90, width: 'calc(100% - 28px)', maxWidth: 410, zIndex: 35, animation: 'slideUp 0.3s ease-out forwards' }}>
            <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', color: '#fff', borderRadius: 22, padding: '18px 18px 16px', boxShadow: '0 22px 44px rgba(17,17,17,0.22)', position: 'relative' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2, color: '#8b95a5', marginBottom: 6 }}>Sponsored</div>
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3 }}>{promoPopup.message}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  onClick={dismissPromo}
                  disabled={submitting}
                  style={{ flex: 1, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#8b95a5', borderRadius: 14, padding: '12px 12px', cursor: submitting ? 'default' : 'pointer', fontWeight: 700, fontSize: 13 }}
                >
                  No thanks
                </button>
                <button
                  onClick={dismissPromo}
                  disabled={submitting}
                  style={{ flex: 1, border: 'none', background: '#3b82f6', color: '#fff', borderRadius: 14, padding: '12px 12px', cursor: submitting ? 'default' : 'pointer', fontWeight: 700, fontSize: 13 }}
                >
                  Learn more
                </button>
              </div>
            </div>
          </div>
        )}

        {maintenanceFeeModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 45 }}>
            <div style={{ width: '100%', maxWidth: 370, background: '#fff', borderRadius: 30, padding: 24, boxShadow: '0 35px 60px rgba(17,17,17,0.22)' }}>
              <div style={{ fontSize: 12, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Vehicle Issue</div>
              <div style={{ fontSize: 30, lineHeight: 1.05, fontWeight: 700, marginTop: 10 }}>{maintenanceFeeModal.issue}</div>
              <div style={{ color: '#70757a', marginTop: 10, lineHeight: 1.5 }}>
                A required repair has been identified on your vehicle. The cost has been automatically deducted from your earnings.
              </div>
              <div style={{ marginTop: 16, background: '#fdf2f2', border: '1px solid #f5c6c6', borderRadius: 16, padding: '14px 16px' }}>
                <div style={{ fontSize: 13, color: '#c0392b', textTransform: 'uppercase', letterSpacing: 0.8 }}>Amount deducted</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: '#c0392b', marginTop: 4 }}>-${maintenanceFeeModal.amount.toFixed(2)}</div>
              </div>
              <button
                onClick={acknowledgeMaintenanceFee}
                disabled={submitting}
                style={{ width: '100%', marginTop: 20, border: 'none', borderRadius: 16, background: '#111', color: '#fff', padding: '15px 12px', cursor: submitting ? 'default' : 'pointer', fontWeight: 700, fontSize: 16 }}
              >
                Acknowledge
              </button>
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
      </div>
      <style>{`
        @keyframes surgePulse {
          0%, 100% { transform: scale(0.94); opacity: 0.58; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(26px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
