import { useState, useEffect } from 'react';
import VenueCreationForm, { type CreatedVenue } from './VenueCreationForm';

interface Venue {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  geoFenceRadius: number;
  isActive: boolean;
}

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-sm';

export default function AdminVenuesPanel() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editRadius, setEditRadius] = useState(150);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    fetch('/api/venues/all', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setVenues(data.venues ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleVenueCreated(venue: CreatedVenue) {
    setVenues(prev => [...prev, venue].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function startEdit(venue: Venue) {
    setEditingId(venue.id);
    setEditName(venue.name);
    setEditAddress(venue.address ?? '');
    setEditLat(String(venue.lat));
    setEditLng(String(venue.lng));
    setEditRadius(venue.geoFenceRadius);
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEdit(id: string) {
    const lat = parseFloat(editLat);
    const lng = parseFloat(editLng);

    if (!editName.trim()) { setEditError('Name is required.'); return; }
    if (isNaN(lat) || isNaN(lng)) { setEditError('Latitude and longitude must be valid numbers.'); return; }

    setSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/venues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editName.trim(),
          address: editAddress.trim() || null,
          lat,
          lng,
          geoFenceRadius: editRadius,
        }),
      });
      if (!res.ok) { setEditError('Failed to save changes. Please try again.'); return; }
      const updated: Venue = await res.json();
      setVenues(prev => prev.map(v => (v.id === id ? updated : v)));
      setEditingId(null);
    } catch {
      setEditError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?\n\nIf this venue has no events linked to it, it will be permanently deleted. Otherwise it will be hidden and can be restored.`)) return;
    const res = await fetch(`/api/venues/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data.deleted) {
        setVenues(prev => prev.filter(v => v.id !== id));
        if (editingId === id) setEditingId(null);
      } else {
        setVenues(prev => prev.map(v => (v.id === id ? data.venue : v)));
        if (editingId === id) setEditingId(null);
      }
    }
  }

  async function handleRestore(id: string) {
    const res = await fetch(`/api/venues/${id}/restore`, { method: 'PATCH', credentials: 'include' });
    if (res.ok) {
      const updated: Venue = await res.json();
      setVenues(prev => prev.map(v => (v.id === id ? updated : v)));
    }
  }

  const activeVenues = venues.filter(v => v.isActive);
  const inactiveVenues = venues.filter(v => !v.isActive);

  function renderVenueRow(venue: Venue) {
    const isEditing = editingId === venue.id;
    return (
      <li key={venue.id} className='bg-gray-900 border border-gray-800 rounded-xl overflow-hidden'>
        <div className='flex items-center justify-between px-4 py-3 gap-3'>
          <div className='min-w-0'>
            <p className={`font-medium truncate ${venue.isActive ? 'text-white' : 'text-gray-500'}`}>
              {venue.name}
              {!venue.isActive && (
                <span className='ml-2 text-xs font-mono bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full'>inactive</span>
              )}
            </p>
            {venue.address && <p className='text-xs text-gray-500 mt-0.5 truncate'>{venue.address}</p>}
            <p className='text-xs text-gray-600 mt-0.5'>{venue.geoFenceRadius}m radius</p>
          </div>
          <div className='flex items-center gap-2 shrink-0'>
            {venue.isActive ? (
              <>
                <button
                  onClick={() => (isEditing ? cancelEdit() : startEdit(venue))}
                  className='text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer'
                >
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
                <button
                  onClick={() => handleDelete(venue.id, venue.name)}
                  className='text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer'
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                onClick={() => handleRestore(venue.id)}
                className='text-xs text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer'
              >
                Restore
              </button>
            )}
          </div>
        </div>

        {isEditing && (
          <div className='border-t border-gray-800 px-4 py-4 flex flex-col gap-3'>
            <p className='text-xs text-gray-400 font-medium uppercase tracking-widest'>Edit venue</p>
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder='Venue name' className={inputClass} />
            <input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder='Address (optional)' className={inputClass} />
            <div className='flex gap-3'>
              <div className='flex-1'>
                <label className='block text-xs text-gray-500 mb-1'>Latitude</label>
                <input value={editLat} onChange={e => setEditLat(e.target.value)} placeholder='e.g. 51.53320' className={`${inputClass} font-mono`} />
              </div>
              <div className='flex-1'>
                <label className='block text-xs text-gray-500 mb-1'>Longitude</label>
                <input value={editLng} onChange={e => setEditLng(e.target.value)} placeholder='e.g. -0.07624' className={`${inputClass} font-mono`} />
              </div>
            </div>
            <div className='flex items-center gap-3'>
              <label className='text-xs text-gray-400 shrink-0'>Geofence radius</label>
              <input
                type='number'
                value={editRadius}
                min={50}
                max={1000}
                onChange={e => setEditRadius(Number(e.target.value))}
                className='w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm'
              />
              <span className='text-xs text-gray-500'>metres</span>
            </div>
            {editError && <p className='text-red-400 text-xs'>{editError}</p>}
            <button
              onClick={() => saveEdit(venue.id)}
              disabled={saving}
              className='w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold px-5 py-2.5 rounded-xl transition-colors cursor-pointer text-sm'
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className='flex flex-col gap-8'>

      {/* Create venue */}
      <div className='bg-gray-900 border border-gray-800 rounded-2xl p-6'>
        <h2 className='text-white font-semibold mb-4'>Add a venue</h2>
        <VenueCreationForm onCreated={handleVenueCreated} submitLabel='Add venue' />
      </div>

      {/* Venue list */}
      {loading ? (
        <p className='text-gray-500 text-sm'>Loading venues…</p>
      ) : venues.length === 0 ? (
        <p className='text-gray-500 text-sm text-center py-8'>No venues yet.</p>
      ) : (
        <div className='flex flex-col gap-6'>
          {activeVenues.length > 0 && (
            <div>
              <h2 className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3'>
                Active · {activeVenues.length}
              </h2>
              <ul className='flex flex-col gap-2'>{activeVenues.map(renderVenueRow)}</ul>
            </div>
          )}

          {inactiveVenues.length > 0 && (
            <div>
              <button
                onClick={() => setShowInactive(prev => !prev)}
                className='flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors cursor-pointer mb-3'
              >
                <svg
                  width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor'
                  strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'
                  className={`transition-transform ${showInactive ? 'rotate-90' : ''}`}
                >
                  <polyline points='9 18 15 12 9 6' />
                </svg>
                Inactive ({inactiveVenues.length})
              </button>
              {showInactive && (
                <ul className='flex flex-col gap-2'>{inactiveVenues.map(renderVenueRow)}</ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
