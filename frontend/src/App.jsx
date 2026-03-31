import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Host from './pages/Host';
import Join from './pages/Join';
import Play from './pages/Play';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={
          <div style={{ padding: 20, fontFamily: 'monospace' }}>
            <h1>GigTrap</h1>
            <p><Link to="/host">Host a Game</Link></p>
            <p><Link to="/join">Join a Game</Link></p>
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
