import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import HomePage from './pages/HomePage';
import OperatorPage from './pages/OperatorPage';
import RoomPickerPage from './pages/RoomPickerPage';
import RoomPage from './pages/RoomPage';
import AdminPage from './pages/AdminPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path='/' element={<HomePage />} />
        <Route path='/admin' element={<AdminPage />} />
        <Route path='/:slug' element={<OperatorPage />} />
        <Route path='/:slug/event/:eventId' element={<RoomPickerPage />} />
        <Route path='/:slug/room/:roomCode' element={<RoomPage />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
