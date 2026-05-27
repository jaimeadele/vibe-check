import { useState, useEffect } from 'react';
import { useCurrentUser } from './hooks/useCurrentUser';
import CreateRoomForm from './components/CreateRoomForm';
import RoomView from './components/RoomView';
import AdminVenuesPage from './components/AdminVenuesPage';

interface Room {
  id: string;
  name: string;
  roomCode: string;
  status: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
  startTime: string;
  createdAt: string;
  venueId: string | null;
  venue: { id: string; name: string; address: string | null } | null;
}

function formatStartTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  );
}

function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingRoom, setPendingRoom] = useState<Room | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [showVenueManager, setShowVenueManager] = useState(false);
  const { user, isPrivileged, login, logout } = useCurrentUser();

  useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => setRooms(data.rooms));
  }, []);

  function handleRoomCreated(room: Room) {
    setRooms(prev => [...prev, room]);
  }

  function handleRoomUpdate(roomId: string, updates: Partial<Pick<Room, 'status' | 'startTime'>>) {
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, ...updates } : r));
  }

  async function handleRemoveEvent(roomId: string) {
    if (!window.confirm('Delete this event and all its songs? This cannot be undone.')) return;
    const res = await fetch(`/api/events/${roomId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) setRooms(prev => prev.filter(r => r.id !== roomId));
  }

  function handleRoomClick(room: Room) {
    // Privileged users always enter directly
    if (isPrivileged) { setActiveRoom(room); return; }
    // Closed events — anyone can view the setlist, nothing to interact with anyway
    if (room.status === 'CLOSED') { setActiveRoom(room); return; }
    // Upcoming events — nothing to see yet, block regular users
    if (room.status === 'UPCOMING') return;
    // Active + venue → enter directly, geofence is checked per-interaction inside RoomView
    if (room.venueId) { setActiveRoom(room); return; }
    // Active + no venue → require room code
    setPendingRoom(room);
    setCodeInput('');
    setCodeError(false);
  }

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (codeInput.trim().toUpperCase() === pendingRoom?.roomCode) {
      setActiveRoom(pendingRoom);
      setPendingRoom(null);
    } else {
      setCodeError(true);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const success = await login(email, password);
    if (success) {
      setEmail('');
      setPassword('');
      setLoginError(false);
      setModalOpen(false);
    } else {
      setLoginError(true);
    }
  }

  if (activeRoom) {
    return <RoomView room={activeRoom} onBack={() => setActiveRoom(null)} isPrivileged={isPrivileged} onRoomUpdate={handleRoomUpdate} />;
  }

  if (showVenueManager) {
    return <AdminVenuesPage onBack={() => setShowVenueManager(false)} />;
  }

  const byTime = (a: Room, b: Room) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  const activeRooms = rooms.filter(r => r.status === 'ACTIVE').sort(byTime);
  const upcomingRooms = rooms.filter(r => r.status === 'UPCOMING').sort(byTime);
  const closedRooms = rooms.filter(r => r.status === 'CLOSED').sort((a, b) => -byTime(a, b));

  const renderRoomList = (sectionRooms: Room[]) => (
    <ul className='flex flex-col gap-3'>
      {sectionRooms.map((room) => (
        <li key={room.id} className='flex items-stretch gap-2'>
          <button
            onClick={() => handleRoomClick(room)}
            className='flex-1 flex items-center justify-between bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl px-5 py-4 transition-colors cursor-pointer'
          >
            <div className='text-left'>
              <p className='text-white font-medium'>{room.name}</p>
              <p className='text-gray-500 text-xs mt-0.5'>{formatStartTime(room.startTime)}</p>
            </div>
            {isPrivileged && (
              <span className='text-xs font-mono bg-gray-800 text-accent px-3 py-1 rounded-full shrink-0 ml-3'>
                {room.roomCode}
              </span>
            )}
          </button>
          {isPrivileged && (
            <button
              onClick={() => handleRemoveEvent(room.id)}
              className='self-stretch w-14 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer'
              aria-label='Delete event'
            >
              <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                <line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>
              </svg>
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className='min-h-screen bg-gray-950 flex flex-col items-center py-8 sm:py-12'>
      <div className='w-full max-w-lg px-4'>
        {/* Header row — title/subtitle left, auth controls right */}
        <div className='flex items-start justify-between mb-10'>
          <div>
            <h1 className='text-4xl font-bold text-white tracking-tight mb-1'>
              Vibe Check
            </h1>
            <p className='text-gray-400'>Manage your events and rooms</p>
          </div>

          <div className='pt-1 shrink-0 ml-4'>
            {user ? (
              <div className='flex items-center gap-3 text-sm'>
                <span className='text-gray-400'>
                  <span className='text-accent'>{user.role}</span>
                </span>
                {user.role === 'ADMIN' && (
                  <button
                    onClick={() => setShowVenueManager(true)}
                    className='text-gray-500 hover:text-white transition-colors cursor-pointer'
                  >
                    Venues
                  </button>
                )}
                <button
                  onClick={logout}
                  className='text-gray-500 hover:text-white transition-colors cursor-pointer'
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setModalOpen(true)}
                className='bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors cursor-pointer'
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        {/* Sign-in modal */}
        {modalOpen && (
          <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'
            onClick={() => { setModalOpen(false); setLoginError(false); }}
          >
            <div
              className='bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center justify-between mb-5'>
                <h2 className='text-white font-semibold text-lg'>Sign in</h2>
                <button
                  onClick={() => { setModalOpen(false); setLoginError(false); }}
                  className='text-gray-500 hover:text-white transition-colors cursor-pointer'
                  aria-label='Close'
                >
                  <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>
                  </svg>
                </button>
              </div>
              <form onSubmit={handleLogin} className='flex flex-col gap-3'>
                <input
                  type='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder='Email'
                  autoFocus
                  className='w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
                />
                <div className='relative'>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder='Password'
                    className='w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
                  />
                  <button
                    type='button'
                    onClick={() => setShowPassword(prev => !prev)}
                    className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer'
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      /* eye-off */
                      <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94'/>
                        <path d='M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19'/>
                        <line x1='1' y1='1' x2='23' y2='23'/>
                      </svg>
                    ) : (
                      /* eye */
                      <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                        <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/>
                        <circle cx='12' cy='12' r='3'/>
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  type='submit'
                  disabled={!email || !password}
                  className='w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm cursor-pointer'
                >
                  Sign in
                </button>
                {loginError && (
                  <p className='text-red-400 text-sm text-center'>
                    Invalid email or password
                  </p>
                )}
              </form>
            </div>
          </div>
        )}

        {/* Room code entry modal */}
        {pendingRoom && (
          <div
            className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'
            onClick={() => { setPendingRoom(null); setCodeError(false); }}
          >
            <div
              className='bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4'
              onClick={e => e.stopPropagation()}
            >
              <div className='flex items-center justify-between mb-5'>
                <h2 className='text-white font-semibold text-lg'>Enter room code</h2>
                <button
                  onClick={() => { setPendingRoom(null); setCodeError(false); }}
                  className='text-gray-500 hover:text-white transition-colors cursor-pointer'
                  aria-label='Close'
                >
                  <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>
                  </svg>
                </button>
              </div>
              <p className='text-gray-400 text-sm mb-4'>
                Enter the code displayed at <span className='text-white'>{pendingRoom.name}</span> to join.
              </p>
              <form onSubmit={handleCodeSubmit} className='flex flex-col gap-3'>
                <input
                  type='text'
                  value={codeInput}
                  onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(false); }}
                  placeholder='e.g. AB12XY'
                  autoFocus
                  autoCapitalize='characters'
                  maxLength={6}
                  className='w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 font-mono tracking-widest text-center text-lg focus:outline-none focus:border-accent transition-colors'
                />
                <button
                  type='submit'
                  disabled={codeInput.length < 6}
                  className='w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm cursor-pointer'
                >
                  Join room
                </button>
                {codeError && (
                  <p className='text-red-400 text-sm text-center'>Incorrect code — try again</p>
                )}
              </form>
            </div>
          </div>
        )}

        {user?.role === 'ADMIN' && <CreateRoomForm onRoomCreated={handleRoomCreated} />}

        {rooms.length > 0 && (
          <div className='mt-10 flex flex-col gap-8'>
            {activeRooms.length > 0 && (
              <div>
                <h2 className='text-xs font-semibold uppercase tracking-widest text-green-400 mb-4'>Active</h2>
                {renderRoomList(activeRooms)}
              </div>
            )}
            {upcomingRooms.length > 0 && (
              <div>
                <h2 className='text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4'>Upcoming</h2>
                {renderRoomList(upcomingRooms)}
              </div>
            )}
            {closedRooms.length > 0 && (
              <div>
                <h2 className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4'>Closed</h2>
                {renderRoomList(closedRooms)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
