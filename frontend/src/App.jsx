import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Host from './pages/Host';
import Join from './pages/Join';
import Play from './pages/Play';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <div style={{ minHeight: '100vh', background: '#f4f4f2', padding: 24 }}>
            <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 18 }}>
              <div style={{ background: '#111', color: '#fff', borderRadius: 32, padding: 28 }}>
                <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2, color: '#b7b7bc' }}>GigTrap</div>
                <h1 style={{ margin: '10px 0 0', fontSize: 52, lineHeight: 0.95 }}>Presentation Build</h1>
                <p style={{ marginTop: 14, maxWidth: 620, color: '#d8d8dd' }}>
                  A classroom simulation about how gig platforms shape worker behavior through interface pressure, opacity, and asymmetrical control.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
                <Link to="/host" style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 28, padding: 24, minHeight: 220 }}>
                    <div style={{ fontSize: 13, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1 }}>Host</div>
                    <div style={{ fontSize: 34, fontWeight: 700, marginTop: 10 }}>Run the room</div>
                    <p style={{ marginTop: 10, color: '#5e6167' }}>Control events, reveal the math, and steer the class through the mechanics.</p>
                  </div>
                </Link>

                <Link to="/join" style={{ textDecoration: 'none' }}>
                  <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 28, padding: 24, minHeight: 220 }}>
                    <div style={{ fontSize: 13, color: '#6b6b6b', textTransform: 'uppercase', letterSpacing: 1 }}>Player</div>
                    <div style={{ fontSize: 34, fontWeight: 700, marginTop: 10 }}>Join a session</div>
                    <p style={{ marginTop: 10, color: '#5e6167' }}>Enter the room code and step into the driver-side interface.</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        } />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
        <Route path="/play" element={<Play />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
