import { useState, useEffect } from 'react';
import { useRoomSocket } from '../hooks/useRoomSocket';
import IdentifyButton from './IdentifyButton';

interface SpotifySearchResult {
  spotifyId: string;
  title: string;
  artist: string;
  albumArt: string | null;
  previewUrl: string | null;
}

interface Song {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  spotifyId: string | null;
  identifiedAt: string;
}

interface VenueSummary {
  id: string;
  name: string;
  address: string | null;
}

interface Room {
  id: string;
  name: string;
  roomCode: string;
  status: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
  startTime: string;
  createdAt: string;
  venueId: string | null;
  venue: VenueSummary | null;
}

interface Props {
  room: Room;
  onBack: () => void;
  isPrivileged: boolean;
  onRoomUpdate: (roomId: string, updates: Partial<Pick<Room, 'status' | 'startTime'>>) => void;
}

function formatStartTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  );
}

function toInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function RoomView({ room, onBack, isPrivileged, onRoomUpdate }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState(room.status);
  const [startTime, setStartTime] = useState(room.startTime);
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState(toInputValue(room.startTime));
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [venue, setVenue] = useState<VenueSummary | null>(room.venue);
  const [editingVenue, setEditingVenue] = useState(false);
  const [venueOptions, setVenueOptions] = useState<VenueSummary[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState(room.venue?.id ?? '');
  const [savingVenue, setSavingVenue] = useState(false);
  useEffect(() => {
    fetch(`/api/events/${room.id}/setlist`)
      .then((res) => res.json())
      .then((data) => setSongs(data.songs));
  }, [room.id]);

  const { isIdentifying } = useRoomSocket(room.roomCode, (song) => {
    setSongs((prev) => [song, ...prev]);
  }, (songId) => {
    setSongs((prev) => prev.filter((s) => s.id !== songId));
  }, (newStatus) => {
    setStatus(newStatus as Room['status']);
    onRoomUpdate(room.id, { status: newStatus as Room['status'] });
  });

  function handleAddSong(e: React.FormEvent) {
    e.preventDefault();
    fetch(`/api/events/${room.id}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title, artist }),
    });
    setTitle('');
    setArtist('');
  }

  async function handleSpotifySearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } finally {
      setIsSearching(false);
    }
  }

  async function handlePickSpotifyResult(result: SpotifySearchResult) {
    await fetch(`/api/events/${room.id}/songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: result.title,
        artist: result.artist,
        albumArt: result.albumArt,
        previewUrl: result.previewUrl,
        spotifyId: result.spotifyId,
      }),
    });
    setSearchQuery('');
    setSearchResults([]);
  }

  async function handleStatusChange(newStatus: string) {
    const res = await fetch(`/api/events/${room.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
      credentials: 'include',
    });
    if (res.ok) {
      setStatus(newStatus as Room['status']);
      onRoomUpdate(room.id, { status: newStatus as Room['status'] });
    }
  }

  async function handleSaveStartTime() {
    const res = await fetch(`/api/events/${room.id}/startTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startTime: new Date(startTimeInput).toISOString() }),
      credentials: 'include',
    });
    if (res.ok) {
      const updated = await res.json();
      setStartTime(updated.startTime);
      setStartTimeInput(toInputValue(updated.startTime));
      setEditingStartTime(false);
      onRoomUpdate(room.id, { startTime: updated.startTime });
    }
  }

  async function handleStartEditVenue() {
    const res = await fetch('/api/venues', { credentials: 'include' });
    const data = await res.json();
    setVenueOptions(data.venues ?? []);
    setSelectedVenueId(venue?.id ?? '');
    setEditingVenue(true);
  }

  async function handleSaveVenue() {
    setSavingVenue(true);
    try {
      const res = await fetch(`/api/events/${room.id}/venue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ venueId: selectedVenueId || null }),
      });
      if (res.ok) {
        const updated = await res.json();
        setVenue(updated.venue);
        setEditingVenue(false);
      }
    } finally {
      setSavingVenue(false);
    }
  }

  function handleRemoveSong(songId: string) {
    if (!window.confirm('Remove this song from the setlist?')) return;
    fetch(`/api/events/${room.id}/songs/${songId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  }

  return (
    <div className='min-h-screen bg-gray-950 flex flex-col items-center px-4 py-10'>
      <div className='w-full max-w-lg'>
        {/* Header */}
        <div className='flex items-center gap-4 mb-8'>
          <button
            onClick={onBack}
            className='text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-2 rounded-xl transition-colors text-sm cursor-pointer shrink-0'
          >
            ← Back
          </button>
          <div className='flex-1'>
            <div className='mb-0.5'>
              <div className='flex items-center gap-2 flex-wrap mb-1'>
                {isPrivileged && statusDropdownOpen ? (
                  (['UPCOMING', 'ACTIVE', 'CLOSED'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { handleStatusChange(s); setStatusDropdownOpen(false); }}
                      className={`text-xs font-medium px-2 py-1 rounded-full transition-colors cursor-pointer ${
                        status === s
                          ? s === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                            s === 'CLOSED' ? 'bg-gray-700 text-gray-400' :
                            'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-800 text-gray-500 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))
                ) : isPrivileged ? (
                  <button
                    onClick={() => setStatusDropdownOpen(true)}
                    className={`text-xs font-medium px-2 py-1 rounded-full transition-colors cursor-pointer ${
                      status === 'ACTIVE' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' :
                      status === 'CLOSED' ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' :
                      'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    }`}
                  >
                    {status}
                  </button>
                ) : (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                    status === 'CLOSED' ? 'bg-gray-700 text-gray-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {status}
                  </span>
                )}
              </div>
              <h1 className='text-2xl font-bold text-white'>{room.name}</h1>
            </div>

            {isPrivileged && (
              <span className='text-xs font-mono text-accent'>{room.roomCode}</span>
            )}

            {editingStartTime ? (
              <div className='flex items-center gap-2 mt-2'>
                <input
                  type='datetime-local'
                  value={startTimeInput}
                  onChange={(e) => setStartTimeInput(e.target.value)}
                  className='bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-accent'
                />
                <button onClick={handleSaveStartTime} className='text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer'>Save</button>
                <button onClick={() => setEditingStartTime(false)} className='text-sm text-gray-500 hover:text-white transition-colors cursor-pointer'>Cancel</button>
              </div>
            ) : (
              <div className='flex items-center gap-2 mt-1'>
                <span className='text-sm text-gray-400'>{formatStartTime(startTime)}</span>
                {isPrivileged && (
                  <button
                    onClick={() => setEditingStartTime(true)}
                    className='text-sm text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded-lg transition-colors cursor-pointer'
                  >
                    Edit
                  </button>
                )}
              </div>
            )}

            {/* Venue — display for everyone, editable by admins */}
            {editingVenue ? (
              <div className='flex items-center gap-2 mt-1'>
                <div className='relative'>
                  <select
                    value={selectedVenueId}
                    onChange={e => setSelectedVenueId(e.target.value)}
                    className='appearance-none bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-8 py-1.5 text-white text-sm focus:outline-none focus:border-accent transition-colors'
                  >
                    <option value=''>No venue</option>
                    {venueOptions.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <svg className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <polyline points='6 9 12 15 18 9' />
                  </svg>
                </div>
                <button onClick={handleSaveVenue} disabled={savingVenue} className='text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer disabled:opacity-40'>
                  {savingVenue ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingVenue(false)} className='text-sm text-gray-500 hover:text-white transition-colors cursor-pointer'>Cancel</button>
              </div>
            ) : (venue || isPrivileged) && (
              <div className='flex items-center gap-2 mt-1'>
                {venue && (
                  <span className='text-sm text-gray-400'>📍 {venue.name}</span>
                )}
                {isPrivileged && (
                  <button
                    onClick={handleStartEditVenue}
                    className='text-sm text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded-lg transition-colors cursor-pointer'
                  >
                    {venue ? 'Edit' : '+ Venue'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Identify button — geofence checked on every tap for non-privileged users */}
        <IdentifyButton
          eventId={room.id}
          roomLocked={isIdentifying}
          eventActive={status === 'ACTIVE'}
          venueId={isPrivileged ? null : venue?.id ?? null}
        />

        {/* Privileged: Spotify search + manual add */}
        {isPrivileged && (
          <div className='mt-4 flex flex-col gap-4'>

            {/* Spotify search */}
            <form onSubmit={handleSpotifySearch} className='flex gap-2'>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search Spotify to add a song…'
                className='flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
              />
              <button
                type='submit'
                disabled={!searchQuery.trim() || isSearching}
                className='bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors text-sm cursor-pointer shrink-0'
              >
                {isSearching ? '…' : 'Search'}
              </button>
            </form>

            {/* Search results */}
            {searchResults.length > 0 && (
              <ul className='flex flex-col gap-2'>
                {searchResults.map((result) => (
                  <li key={result.spotifyId}>
                    <button
                      onClick={() => handlePickSpotifyResult(result)}
                      className='w-full flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-accent rounded-xl px-4 py-3 transition-colors cursor-pointer text-left'
                    >
                      {result.albumArt ? (
                        <img src={result.albumArt} alt={result.title} className='w-10 h-10 rounded-lg object-cover shrink-0' />
                      ) : (
                        <div className='w-10 h-10 rounded-lg bg-gray-800 shrink-0' />
                      )}
                      <div className='flex-1 min-w-0'>
                        <p className='text-white text-sm font-medium truncate'>{result.title}</p>
                        <p className='text-gray-400 text-xs truncate'>{result.artist}</p>
                      </div>
                      <span className='text-accent text-xs shrink-0'>Add</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Manual fallback */}
            <details className='group'>
              <summary className='text-xs text-gray-500 hover:text-gray-300 cursor-pointer transition-colors select-none'>
                Add manually instead
              </summary>
              <form onSubmit={handleAddSong} className='flex flex-col gap-2 mt-2 sm:flex-row sm:gap-3'>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder='Song title'
                  className='w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
                />
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder='Artist'
                  className='w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
                />
                <button
                  type='submit'
                  disabled={!title || !artist}
                  className='w-full sm:w-auto bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-4 py-3 rounded-xl transition-colors text-sm cursor-pointer'
                >
                  Add
                </button>
              </form>
            </details>

          </div>
        )}

        {/* Setlist */}
        <div className='mt-8'>
          <h2 className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4'>
            Setlist
          </h2>
          {songs.length === 0 ? (
            <p className='text-gray-600 text-sm text-center py-12'>
              No songs identified yet
            </p>
          ) : (
            <ul className='flex flex-col gap-3'>
              {songs.map((song) => (
                <li
                  key={song.id}
                  className='flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3'
                >
                  {song.albumArt ? (
                    <img
                      src={song.albumArt}
                      alt={song.title}
                      className='w-12 h-12 rounded-lg object-cover shrink-0'
                    />
                  ) : (
                    <div className='w-12 h-12 rounded-lg bg-gray-800 shrink-0' />
                  )}
                  <div className='flex-1 min-w-0'>
                    <p className='text-white font-medium truncate'>
                      {song.title}
                    </p>
                    <p className='text-gray-400 text-sm truncate'>
                      {song.artist}
                    </p>
                  </div>
                  {song.spotifyId && (
                    <a
                      href={`https://open.spotify.com/track/${song.spotifyId}`}
                      target='_blank'
                      rel='noreferrer'
                      className='text-accent hover:text-accent-hover text-xs font-medium shrink-0 transition-colors'
                    >
                      <p className='text-center'>Open in</p>
                      <p className='text-center'>Spotify ↗</p>
                    </a>
                  )}
                  {isPrivileged && (
                    <button
                      onClick={() => handleRemoveSong(song.id)}
                      className='p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors shrink-0 cursor-pointer'
                      aria-label='Remove song'
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default RoomView;
