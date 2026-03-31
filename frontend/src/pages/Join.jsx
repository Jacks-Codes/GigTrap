import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';

export default function Join() {
  const { socket, connected } = useSocket();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleJoin = () => {
    if (!code || !name) return;
    socket.emit('player:join', { code, name }, (res) => {
      if (res.error) {
        setError(res.error);
      } else {
        sessionStorage.setItem('gigtrap_player', JSON.stringify(res.state));
        sessionStorage.setItem('gigtrap_room', code.toUpperCase());
        navigate('/play');
      }
    });
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
          disabled={!connected || !code || !name}
          style={{ width: '100%', marginTop: 18, border: 'none', borderRadius: 18, background: connected && code && name ? '#111' : '#b6b7bb', color: '#fff', padding: '16px 18px', fontWeight: 700, fontSize: 16, cursor: connected && code && name ? 'pointer' : 'default' }}
        >
          {connected ? 'Continue' : 'Connecting...'}
        </button>
      </div>
    </div>
  );
}
