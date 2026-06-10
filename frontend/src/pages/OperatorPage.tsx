import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { formatStartTime } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import VenueCreationForm, { type CreatedVenue } from '../components/VenueCreationForm';

// ── Types ────────────────────────────────────────────────────────────────────

interface Venue {
  id: string;
  name: string;
}

interface Room {
  id: string;
  name: string;
  roomCode: string;
  status: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
  djs: { user: { id: string; name: string } }[];
}

interface Event {
  id: string;
  name: string;
  startTime: string;
  venue: { id: string; name: string; address: string | null } | null;
  rooms: Room[];
  recurrenceFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | null;
  recurrenceDayOfWeek: number | null;
  recurrenceDayPosition: number | null;
}

interface Operator {
  id: string;
  name: string;
  slug: string;
  events: Event[];
}

function getDayPosition(date: Date): number {
  const day = date.getDay();
  const month = date.getMonth();
  const year = date.getFullYear();
  const lastDay = new Date(year, month + 1, 0).getDate();
  let total = 0;
  let occurrence = 0;
  for (let d = 1; d <= lastDay; d++) {
    if (new Date(year, month, d).getDay() === day) {
      total++;
      if (d <= date.getDate()) occurrence++;
    }
  }
  return occurrence === total ? -1 : occurrence;
}

function calcNextOccurrence(
  freq: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
  dayOfWeek: number,
  dayPosition: number | null,
  prevStartTime: string,
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const prev = new Date(prevStartTime);

  if (freq === 'WEEKLY') {
    const result = new Date(prev);
    result.setDate(prev.getDate() + 7);
    return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}T21:00`;
  }

  if (freq === 'BIWEEKLY') {
    const result = new Date(prev);
    result.setDate(prev.getDate() + 14);
    return `${result.getFullYear()}-${pad(result.getMonth() + 1)}-${pad(result.getDate())}T21:00`;
  }

  // MONTHLY — find the Nth (or last) occurrence of dayOfWeek in the month after prev
  const year = prev.getMonth() === 11 ? prev.getFullYear() + 1 : prev.getFullYear();
  const month = (prev.getMonth() + 1) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const occurrences: number[] = [];
  for (let d = 1; d <= lastDay; d++) {
    if (new Date(year, month, d).getDay() === dayOfWeek) occurrences.push(d);
  }
  const targetDay = dayPosition === -1
    ? occurrences[occurrences.length - 1]
    : occurrences[(dayPosition ?? 1) - 1];
  return `${year}-${pad(month + 1)}-${pad(targetDay)}T21:00`;
}

function describeRecurrence(freq: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY', date: Date, dayPosition: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[date.getDay()];
  if (freq === 'WEEKLY') return `Every ${dayName}`;
  if (freq === 'BIWEEKLY') return `Every other ${dayName}`;
  const posLabel = dayPosition === -1 ? 'last'
    : dayPosition === 1 ? 'first'
    : dayPosition === 2 ? 'second'
    : dayPosition === 3 ? 'third'
    : 'fourth';
  return `The ${posLabel} ${dayName} of each month`;
}

function primaryStatus(event: Event): 'ACTIVE' | 'UPCOMING' | 'CLOSED' {
  if (event.rooms.some(r => r.status === 'ACTIVE')) return 'ACTIVE';
  if (event.rooms.some(r => r.status === 'UPCOMING')) return 'UPCOMING';
  return 'CLOSED';
}

const statusStyle = {
  ACTIVE: 'bg-green-500/20 text-green-400',
  UPCOMING: 'bg-blue-500/20 text-blue-400',
  CLOSED: 'bg-gray-700 text-gray-400',
};

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-sm';

// ── Component ────────────────────────────────────────────────────────────────

export default function OperatorPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [operator, setOperator] = useState<Operator | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);

  // Create event form
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventVenueId, setNewEventVenueId] = useState('');
  const [creatingEvent, setCreatingEvent] = useState(false);

  // Room mode for event creation
  const [roomMode, setRoomMode] = useState<'single' | 'multi'>('single');
  const [multiRoomNames, setMultiRoomNames] = useState<string[]>(['', '']);

  // Venue combobox (for event form)
  const [venueSearch, setVenueSearch] = useState('');
  const [venueDropdownOpen, setVenueDropdownOpen] = useState(false);
  const venueComboRef = useRef<HTMLDivElement>(null);

  // Venue creation modal
  const [showVenueModal, setShowVenueModal] = useState(false);

  // Add room modal
  const [addRoomModal, setAddRoomModal] = useState<{
    eventId: string;
    existingRoom: { id: string; name: string } | null;
  } | null>(null);
  const [addRoomNewName, setAddRoomNewName] = useState('');
  const [addRoomRenameTo, setAddRoomRenameTo] = useState('');
  const [addingRoom, setAddingRoom] = useState(false);

  // Status dropdown (one room at a time)
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null);

  // Recurrence
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | null>(null);

  useEffect(() => {
    fetch(`/api/operators/${slug}`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(data => { if (data) setOperator(data.operator); })
      .finally(() => setLoading(false));
  }, [slug]);

  const isPagePrivileged = operator !== null && (
    user?.userId === operator.id || user?.role === 'ADMIN'
  );
  const isOwner = operator !== null && user?.userId === operator.id;

  useEffect(() => {
    if (isPagePrivileged) {
      fetch('/api/venues', { credentials: 'include' })
        .then(r => r.json())
        .then(data => setVenues(data.venues ?? []));
    }
  }, [isPagePrivileged]);

  // Close venue combobox dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (venueComboRef.current && !venueComboRef.current.contains(e.target as Node)) {
        setVenueDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Venue combobox ────────────────────────────────────────────────────────

  const selectedVenue = venues.find(v => v.id === newEventVenueId);
  const filteredVenues = selectedVenue
    ? venues
    : venues.filter(v =>
        venueSearch === '' ||
        v.name.toLowerCase().includes(venueSearch.toLowerCase())
      );

  function selectVenue(venue: Venue | null) {
    if (venue) {
      setNewEventVenueId(venue.id);
      setVenueSearch(venue.name);
    } else {
      setNewEventVenueId('');
      setVenueSearch('');
    }
    setVenueDropdownOpen(false);
  }

  // ── Create event ──────────────────────────────────────────────────────────

  function resetCreateEventForm() {
    setNewEventName(''); setNewEventTime(''); setNewEventVenueId('');
    setVenueSearch(''); setVenueDropdownOpen(false);
    setRoomMode('single');
    setMultiRoomNames(['', '']);
    setRecurrenceFrequency(null);
    setShowCreateEvent(false);
  }

  async function handleCreateEvent(e: { preventDefault(): void }) {
    e.preventDefault();
    setCreatingEvent(true);
    try {
      const body: Record<string, unknown> = {
        name: newEventName,
        startTime: new Date(newEventTime).toISOString(),
        venueId: newEventVenueId || null,
      };
      if (roomMode === 'multi') {
        body.rooms = multiRoomNames.map(r => r.trim()).filter(Boolean);
      }
      if (recurrenceFrequency) {
        body.recurrenceFrequency = recurrenceFrequency;
        body.recurrenceDayOfWeek = new Date(newEventTime).getDay();
        if (recurrenceFrequency === 'MONTHLY') {
          body.recurrenceDayPosition = getDayPosition(new Date(newEventTime));
        }
      }
      const res = await fetch('/api/events', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const event = await res.json();
      setOperator(prev => prev ? { ...prev, events: [event, ...prev.events] } : prev);
      resetCreateEventForm();
    } finally {
      setCreatingEvent(false);
    }
  }

  function handleScheduleNext(e: React.MouseEvent, event: Event) {
    e.stopPropagation();
    const nextDate = calcNextOccurrence(
      event.recurrenceFrequency!,
      event.recurrenceDayOfWeek!,
      event.recurrenceDayPosition,
      event.startTime,
    );
    setNewEventName(event.name);
    const venueStillActive = venues.some(v => v.id === event.venue?.id);
    setNewEventVenueId(venueStillActive ? (event.venue?.id ?? '') : '');
    setVenueSearch(venueStillActive ? (event.venue?.name ?? '') : '');
    setNewEventTime(nextDate);
    setRecurrenceFrequency(event.recurrenceFrequency);
    if (event.rooms.length > 1) {
      setRoomMode('multi');
      setMultiRoomNames(event.rooms.map(r => r.name));
    } else {
      setRoomMode('single');
      setMultiRoomNames(['', '']);
    }
    setShowCreateEvent(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteEvent(e: React.MouseEvent, eventId: string) {
    e.stopPropagation();
    if (!window.confirm('Delete this event and all its rooms? This cannot be undone.')) return;
    const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) setOperator(prev => prev ? { ...prev, events: prev.events.filter(ev => ev.id !== eventId) } : prev);
  }

  // ── Add room modal ────────────────────────────────────────────────────────

  function openAddRoomModal(event: Event) {
    const existingRoom = event.rooms.length === 1 ? { id: event.rooms[0].id, name: event.rooms[0].name } : null;
    setAddRoomModal({ eventId: event.id, existingRoom });
    setAddRoomNewName('');
    setAddRoomRenameTo(existingRoom?.name ?? '');
  }

  function closeAddRoomModal() {
    setAddRoomModal(null);
    setAddRoomNewName('');
    setAddRoomRenameTo('');
  }

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!addRoomModal) return;
    setAddingRoom(true);
    try {
      const { eventId, existingRoom } = addRoomModal;

      // Rename the existing room if the operator changed the name
      if (existingRoom && addRoomRenameTo.trim() && addRoomRenameTo.trim() !== existingRoom.name) {
        await fetch(`/api/events/${eventId}/rooms/${existingRoom.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: addRoomRenameTo.trim() }),
        });
        setOperator(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            events: prev.events.map(ev =>
              ev.id === eventId
                ? { ...ev, rooms: ev.rooms.map(r => r.id === existingRoom.id ? { ...r, name: addRoomRenameTo.trim() } : r) }
                : ev
            ),
          };
        });
      }

      // Create the new room
      const res = await fetch(`/api/events/${eventId}/rooms`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addRoomNewName.trim() }),
      });
      if (res.ok) {
        const room = await res.json();
        setOperator(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            events: prev.events.map(ev =>
              ev.id === eventId ? { ...ev, rooms: [...ev.rooms, { ...room, djs: [] }] } : ev
            ),
          };
        });
      }
      closeAddRoomModal();
    } finally {
      setAddingRoom(false);
    }
  }

  // ── Delete room ───────────────────────────────────────────────────────────

  async function handleDeleteRoom(e: React.MouseEvent, eventId: string, roomId: string) {
    e.stopPropagation();
    if (!window.confirm('Delete this room and its entire setlist?')) return;
    const res = await fetch(`/api/events/${eventId}/rooms/${roomId}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      setOperator(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          events: prev.events.map(ev =>
            ev.id === eventId ? { ...ev, rooms: ev.rooms.filter(r => r.id !== roomId) } : ev
          ),
        };
      });
    }
  }

  // ── Room status ───────────────────────────────────────────────────────────

  async function handleStatusChange(e: React.MouseEvent, eventId: string, roomId: string, status: string) {
    e.stopPropagation();
    setStatusDropdown(null);
    const res = await fetch(`/api/events/${eventId}/rooms/${roomId}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setOperator(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          events: prev.events.map(ev =>
            ev.id === eventId
              ? { ...ev, rooms: ev.rooms.map(r => r.id === roomId ? { ...r, status: status as Room['status'] } : r) }
              : ev
          ),
        };
      });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <Layout backTo='/'><p className='text-gray-600 text-sm text-center py-12'>Loading…</p></Layout>;
  if (notFound || !operator) return <Layout title='Not found' backTo='/'><p className='text-gray-600 text-sm text-center py-12'>Operator not found</p></Layout>;

  const active = operator.events.filter(e => primaryStatus(e) === 'ACTIVE');
  const upcoming = operator.events.filter(e => primaryStatus(e) === 'UPCOMING' || e.rooms.length === 0);
  const closed = operator.events.filter(e => e.rooms.length > 0 && primaryStatus(e) === 'CLOSED');

  const multiRoomValid = roomMode !== 'multi' || multiRoomNames.filter(r => r.trim()).length >= 2;

  function renderEvent(event: Event) {
    const status = primaryStatus(event);
    // Single-room events navigate directly to the room for everyone (operator + public).
    // Multi-room events are not card-clickable; rooms are shown inline.
    const clickable = event.rooms.length === 1;

    return (
      <li key={event.id}>
        <div
          onClick={() => { if (clickable) navigate(`/${slug}/room/${event.rooms[0].roomCode}`); }}
          className={`bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 transition-colors ${
            clickable ? 'hover:bg-gray-800 hover:border-gray-700 cursor-pointer' : ''
          }`}
        >
          <div className='flex items-start justify-between gap-3'>
            <div className='flex-1 min-w-0'>
              <p className='text-white font-medium'>{event.name}</p>
              <p className='text-gray-500 text-xs mt-0.5'>{formatStartTime(event.startTime)}</p>
              {event.venue && <p className='text-gray-500 text-xs mt-0.5'>📍 {event.venue.name}</p>}
            </div>

            <div className='flex flex-col items-end gap-1.5 shrink-0'>
              {isPagePrivileged ? (
                <button
                  onClick={e => handleDeleteEvent(e, event.id)}
                  className='p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer'
                  aria-label='Delete event'
                >
                  <svg width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>
                  </svg>
                </button>
              ) : (
                <>
                  {event.rooms.length === 0 && <span className='text-xs text-gray-600'>No rooms yet</span>}
                  {event.rooms.length === 1 && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle[status]}`}>
                      {status}
                    </span>
                  )}
                  {/* multi-room: no header badge — room buttons shown inline below */}
                </>
              )}
            </div>
          </div>

          {/* Public view: room buttons for multi-room events */}
          {!isPagePrivileged && event.rooms.length > 1 && (
            <div className='mt-3 flex flex-col gap-2' onClick={e => e.stopPropagation()}>
              {event.rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => navigate(`/${slug}/room/${room.roomCode}`)}
                  className='flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors cursor-pointer text-left'
                >
                  <span className='text-sm text-white font-medium'>{room.name}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusStyle[room.status]}`}>
                    {room.status}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Operator view: room rows (multi-room only) + add room button */}
          {isPagePrivileged && (
            <div className='mt-3' onClick={e => e.stopPropagation()}>
              {event.rooms.length > 1 && (
                <div className='flex flex-col gap-2 mb-3'>
                  {event.rooms.map(room => (
                    <div key={room.id} className='flex items-center gap-2 pl-1'>
                      <div className='relative'>
                        <button
                          onClick={e => { e.stopPropagation(); setStatusDropdown(statusDropdown === room.id ? null : room.id); }}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors cursor-pointer ${statusStyle[room.status]}`}
                        >
                          {room.status}
                        </button>
                        {statusDropdown === room.id && (
                          <div className='absolute left-0 top-full mt-1 z-10 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-lg'>
                            {(['UPCOMING', 'ACTIVE', 'CLOSED'] as const).filter(s => s !== room.status).map(s => (
                              <button
                                key={s}
                                onClick={e => handleStatusChange(e, event.id, room.id, s)}
                                className={`block w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-gray-700 transition-colors cursor-pointer ${statusStyle[s]}`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => navigate(`/${slug}/room/${room.roomCode}`)}
                        className='flex-1 text-left text-sm text-gray-300 hover:text-white transition-colors cursor-pointer truncate'
                      >
                        {room.name}
                      </button>

                      <button
                        onClick={e => handleDeleteRoom(e, event.id, room.id)}
                        className='p-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer shrink-0'
                        aria-label='Delete room'
                      >
                        <svg width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                          <line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className='flex gap-2 flex-wrap'>
                <button
                  onClick={() => openAddRoomModal(event)}
                  className='text-xs font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors cursor-pointer'
                >
                  + Add room
                </button>
                {event.recurrenceFrequency && (
                  <button
                    onClick={e => handleScheduleNext(e, event)}
                    className='text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer'
                  >
                    ↻ Schedule next
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </li>
    );
  }

  return (
    <>
      <Layout title={operator.name} subtitle='Events' backTo='/'>

        {isOwner && (
          <div className='mb-8'>
            {showCreateEvent ? (
              <form onSubmit={handleCreateEvent} className='bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3'>
                <h2 className='text-white font-semibold'>New event</h2>
                <input
                  value={newEventName}
                  onChange={e => setNewEventName(e.target.value)}
                  placeholder='Event name'
                  autoFocus
                  className={inputClass}
                />
                <input
                  type='datetime-local'
                  value={newEventTime}
                  onChange={e => setNewEventTime(e.target.value)}
                  className={inputClass}
                />

                {/* Venue searchable combobox */}
                <div className='relative' ref={venueComboRef}>
                  <input
                    type='text'
                    value={venueSearch}
                    onFocus={() => setVenueDropdownOpen(true)}
                    onChange={e => {
                      setVenueSearch(e.target.value);
                      setNewEventVenueId('');
                      setVenueDropdownOpen(true);
                    }}
                    placeholder='Search venues…'
                    className={inputClass + ' pr-8'}
                  />
                  <svg className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <polyline points='6 9 12 15 18 9'/>
                  </svg>
                  {venueDropdownOpen && (
                    <div className='absolute z-20 left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden'>
                      <div className='max-h-48 overflow-y-auto'>
                        <button
                          type='button'
                          onMouseDown={() => selectVenue(null)}
                          className='w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-700 transition-colors cursor-pointer'
                        >
                          No venue
                        </button>
                        {filteredVenues.map(v => (
                          <button
                            key={v.id}
                            type='button'
                            onMouseDown={() => selectVenue(v)}
                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                              newEventVenueId === v.id ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'
                            }`}
                          >
                            {v.name}
                          </button>
                        ))}
                        {filteredVenues.length === 0 && venueSearch && (
                          <p className='px-4 py-2.5 text-xs text-gray-500'>No venues match "{venueSearch}"</p>
                        )}
                      </div>
                      <div className='border-t border-gray-700'>
                        <button
                          type='button'
                          onMouseDown={e => { e.preventDefault(); setVenueDropdownOpen(false); setShowVenueModal(true); }}
                          className='w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-gray-700 transition-colors cursor-pointer'
                        >
                          + Create new venue
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Room mode toggle */}
                <div>
                  <p className='text-xs text-gray-400 mb-2'>Room setup</p>
                  <div className='flex gap-2'>
                    <button
                      type='button'
                      onClick={() => setRoomMode('single')}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        roomMode === 'single' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      Single room
                    </button>
                    <button
                      type='button'
                      onClick={() => setRoomMode('multi')}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        roomMode === 'multi' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      Multiple rooms
                    </button>
                  </div>
                </div>

                {roomMode === 'multi' && (
                  <div className='flex flex-col gap-2'>
                    {multiRoomNames.map((name, i) => (
                      <div key={i} className='flex gap-2'>
                        <input
                          value={name}
                          onChange={e => {
                            const updated = [...multiRoomNames];
                            updated[i] = e.target.value;
                            setMultiRoomNames(updated);
                          }}
                          placeholder={`Room ${i + 1} name (e.g. Main Stage)`}
                          className={inputClass + ' flex-1'}
                        />
                        {multiRoomNames.length > 2 && (
                          <button
                            type='button'
                            onClick={() => setMultiRoomNames(prev => prev.filter((_, j) => j !== i))}
                            className='p-2.5 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer shrink-0'
                            aria-label='Remove room'
                          >
                            <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                              <line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type='button'
                      onClick={() => setMultiRoomNames(prev => [...prev, ''])}
                      className='text-xs text-gray-500 hover:text-accent transition-colors cursor-pointer text-left'
                    >
                      + Add another room
                    </button>
                  </div>
                )}

                {/* Recurrence toggle */}
                <div className='flex flex-col gap-2'>
                  <label className='flex items-center gap-2 cursor-pointer w-fit'>
                    <input
                      type='checkbox'
                      checked={recurrenceFrequency !== null}
                      onChange={e => setRecurrenceFrequency(e.target.checked ? 'WEEKLY' : null)}
                      className='w-4 h-4 rounded accent-accent cursor-pointer'
                    />
                    <span className='text-sm text-gray-400'>Repeat this event</span>
                  </label>
                  {recurrenceFrequency !== null && (
                    <div className='flex flex-col gap-2 pl-6'>
                      <select
                        value={recurrenceFrequency}
                        onChange={e => setRecurrenceFrequency(e.target.value as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')}
                        className='bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-accent transition-colors w-fit'
                      >
                        <option value='WEEKLY'>Every week</option>
                        <option value='BIWEEKLY'>Every 2 weeks</option>
                        <option value='MONTHLY'>Every month</option>
                      </select>
                      {newEventTime && (
                        <p className='text-xs text-gray-500'>
                          {describeRecurrence(recurrenceFrequency, new Date(newEventTime), getDayPosition(new Date(newEventTime)))}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className='flex gap-2'>
                  <button
                    type='submit'
                    disabled={!newEventName.trim() || !newEventTime || !multiRoomValid || creatingEvent}
                    className='flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer'
                  >
                    {creatingEvent ? 'Creating…' : 'Create event'}
                  </button>
                  <button
                    type='button'
                    onClick={resetCreateEventForm}
                    className='flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer'
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowCreateEvent(true)}
                className='w-full bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-white text-sm font-medium py-3 rounded-xl transition-colors cursor-pointer'
              >
                + New event
              </button>
            )}
          </div>
        )}

        {operator.events.length === 0 ? (
          <p className='text-gray-600 text-sm text-center py-12'>No events yet</p>
        ) : (
          <div className='flex flex-col gap-8'>
            {active.length > 0 && (
              <section>
                <h2 className='text-xs font-semibold uppercase tracking-widest text-green-400 mb-4'>Active</h2>
                <ul className='flex flex-col gap-3'>{active.map(renderEvent)}</ul>
              </section>
            )}
            {upcoming.length > 0 && (
              <section>
                <h2 className='text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4'>Upcoming</h2>
                <ul className='flex flex-col gap-3'>{upcoming.map(renderEvent)}</ul>
              </section>
            )}
            {closed.length > 0 && (
              <section>
                <h2 className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4'>Closed</h2>
                <ul className='flex flex-col gap-3'>{closed.map(renderEvent)}</ul>
              </section>
            )}
          </div>
        )}
      </Layout>

      {/* Venue creation modal */}
      {showVenueModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70' onClick={() => setShowVenueModal(false)}>
          <div className='bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md' onClick={e => e.stopPropagation()}>
            <h2 className='text-white font-semibold mb-1'>Create venue</h2>
            <p className='text-xs text-gray-400 mb-4'>Search for the venue or use your current location</p>
            <VenueCreationForm
              onCreated={(venue: CreatedVenue) => {
                const newEntry = { id: venue.id, name: venue.name };
                setVenues(prev => [...prev, newEntry].sort((a, b) => a.name.localeCompare(b.name)));
                selectVenue(newEntry);
                setShowVenueModal(false);
              }}
              onCancel={() => setShowVenueModal(false)}
            />
          </div>
        </div>
      )}

      {/* Add room modal */}
      {addRoomModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70' onClick={closeAddRoomModal}>
          <div className='bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md' onClick={e => e.stopPropagation()}>
            <h2 className='text-white font-semibold mb-4'>Add room</h2>
            <form onSubmit={handleAddRoom} className='flex flex-col gap-3'>

              {addRoomModal.existingRoom && (
                <div>
                  <label className='text-xs text-gray-400 block mb-1.5'>
                    Rename "{addRoomModal.existingRoom.name}" to (optional)
                  </label>
                  <input
                    value={addRoomRenameTo}
                    onChange={e => setAddRoomRenameTo(e.target.value)}
                    placeholder={addRoomModal.existingRoom.name}
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                {addRoomModal.existingRoom && (
                  <label className='text-xs text-gray-400 block mb-1.5'>New room name</label>
                )}
                <input
                  value={addRoomNewName}
                  onChange={e => setAddRoomNewName(e.target.value)}
                  placeholder='New room name (e.g. Stage B)'
                  autoFocus
                  className={inputClass}
                />
              </div>

              <div className='flex gap-2 mt-1'>
                <button
                  type='submit'
                  disabled={!addRoomNewName.trim() || addingRoom}
                  className='flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer'
                >
                  {addingRoom ? 'Adding…' : 'Add room'}
                </button>
                <button
                  type='button'
                  onClick={closeAddRoomModal}
                  className='flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer'
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
