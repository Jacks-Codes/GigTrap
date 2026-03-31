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
        // Store state and navigate to play
        sessionStorage.setItem('gigtrap_player', JSON.stringify(res.state));
        sessionStorage.setItem('gigtrap_room', code.toUpperCase());
        navigate('/play');
      }
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>GigTrap — Join Game</h1>
      <p>Socket: {connected ? 'Connected' : 'Disconnected'}</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div>
        <input
          placeholder="Room Code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={{ fontSize: 18, marginRight: 10 }}
        />
        <input
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontSize: 18, marginRight: 10 }}
        />
        <button onClick={handleJoin} disabled={!connected || !code || !name}>
          Join
        </button>
      </div>
    </div>
  );
}
