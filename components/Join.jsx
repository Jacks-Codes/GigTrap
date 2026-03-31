'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Join() {
  const router = useRouter();
  const [code, setCode] = useState(() => {
    const codeFromUrl = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('code')
      : null;
    return codeFromUrl ? codeFromUrl.toUpperCase() : '';
  });
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async () => {
    if (!code || !name || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/player/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok || data.error) {
      setError(data.error || 'Unable to join room');
      return;
    }

    sessionStorage.setItem('gigtrap_player', JSON.stringify(data.state));
    sessionStorage.setItem('gigtrap_room', data.roomCode);
    router.push('/play');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f4f2', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 32, padding: 28, boxShadow: '0 30px 60px rgba(17,17,17,0.08)', border: '1px solid #e9e9e9' }}>
        <div style={{ width: 54, height: 54, borderRadius: 18, background: '#111', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 28, marginBottom: 18 }}>
          G
        </div>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: '#6b6b6b' }}>GigTrap Driver</div>
        <h1 style={{ fontSize: 38, lineHeight: 1, margin: '8px 0 10px' }}>Enter your details</h1>
        <p style={{ color: '#61656b', marginBottom: 18 }}>
          Join the room and open the driver interface.
        </p>

        {error && (
          <div style={{ marginBottom: 14, borderRadius: 18, background: '#fff2f1', color: '#bc3429', padding: '12px 14px', border: '1px solid #f4d2ce' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#5c6066' }}>Room code</span>
            <input
              placeholder="ABCDE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              style={{ width: '100%', borderRadius: 18, border: '1px solid #d8d8dd', background: '#fff', padding: '16px 18px', fontSize: 18, fontWeight: 700, letterSpacing: 2 }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#5c6066' }}>Name</span>
            <input
              placeholder="Driver name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', borderRadius: 18, border: '1px solid #d8d8dd', background: '#fff', padding: '16px 18px', fontSize: 17 }}
            />
          </label>
        </div>

        <button
          onClick={handleJoin}
          disabled={!code || !name || submitting}
          style={{ width: '100%', marginTop: 18, border: 'none', borderRadius: 18, background: code && name && !submitting ? '#111' : '#b6b7bb', color: '#fff', padding: '16px 18px', fontWeight: 700, fontSize: 16, cursor: code && name && !submitting ? 'pointer' : 'default' }}
        >
          {submitting ? 'Joining...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
