/// <reference types="google.maps" />
import { useState, useEffect, useRef } from 'react';

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

interface Venue {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  geoFenceRadius: number;
}

interface CreateRoomFormProps {
  onRoomCreated: (room: Room) => void;
}

function getDefaultStartTime() {
  const now = new Date();
  const target = new Date(now);
  if (now.getHours() >= 21) {
    target.setDate(target.getDate() + 1);
  }
  target.setHours(21, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T21:00`;
}

function getNowInput() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Singleton Maps script loader
// ---------------------------------------------------------------------------
let mapsScriptLoaded = false;
let mapsScriptPromise: Promise<void> | null = null;

function loadMapsScript(): Promise<void> {
  if (mapsScriptLoaded) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;

  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    const callbackName = '__mapsReady_' + Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)[callbackName] = () => {
      mapsScriptLoaded = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any)[callbackName];
      resolve();
    };
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}` +
      `&v=beta` +
      `&libraries=places` +
      `&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });

  return mapsScriptPromise;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
function CreateRoomForm({ onRoomCreated }: CreateRoomFormProps) {
  // Event fields
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState(getDefaultStartTime);
  const [loading, setLoading] = useState(false);

  // Venue selection
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>('');
  const [showNewVenueForm, setShowNewVenueForm] = useState(false);

  // New venue fields
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueLat, setVenueLat] = useState<number | null>(null);
  const [venueLng, setVenueLng] = useState<number | null>(null);
  const [geoFenceRadius, setGeoFenceRadius] = useState(150);
  const [locatingUser, setLocatingUser] = useState(false);
  const [creatingVenue, setCreatingVenue] = useState(false);

  // Venue search autocomplete (custom — avoids PlaceAutocompleteElement event issues)
  const [venueSearch, setVenueSearch] = useState('');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch existing venues on mount
  useEffect(() => {
    fetch('/api/venues', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setVenues(data.venues ?? []));
  }, []);

  // Pre-load the Maps script as soon as the new-venue form opens
  useEffect(() => {
    if (!showNewVenueForm) return;
    loadMapsScript().then(() => setMapsReady(true));
  }, [showNewVenueForm]);

  // Debounced autocomplete fetch
  async function handleVenueSearch(input: string) {
    setVenueSearch(input);
    setPredictions([]);

    if (!input.trim() || !mapsReady) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
      try {
        const { suggestions } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: sessionTokenRef.current,
          });
        setPredictions(suggestions ?? []);
      } catch (err) {
        console.error('Autocomplete fetch error:', err);
      }
    }, 300);
  }

  // Called when the user clicks a prediction row
  async function handlePredictionSelect(
    suggestion: google.maps.places.AutocompleteSuggestion,
  ) {
    if (!suggestion.placePrediction) return;
    setPredictions([]);

    const place = suggestion.placePrediction.toPlace();
    try {
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      const display = place.displayName ?? '';
      setVenueSearch(display);
      setVenueName(display);
      setVenueAddress(place.formattedAddress ?? '');
      if (place.location) {
        setVenueLat(place.location.lat());
        setVenueLng(place.location.lng());
      }
      // A new session token must be used for the next autocomplete flow
      sessionTokenRef.current = null;
    } catch (err) {
      console.error('fetchFields error:', err);
    }
  }

  function handleVenueDropdownChange(value: string) {
    if (value === 'new') {
      setSelectedVenueId('');
      setShowNewVenueForm(true);
    } else {
      setSelectedVenueId(value);
      setShowNewVenueForm(false);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) return;
    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setVenueLat(pos.coords.latitude);
        setVenueLng(pos.coords.longitude);
        setLocatingUser(false);
      },
      () => setLocatingUser(false),
    );
  }

  async function handleCreateVenue() {
    if (!venueName || venueLat === null || venueLng === null) return;
    setCreatingVenue(true);
    try {
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: venueName,
          address: venueAddress || null,
          lat: venueLat,
          lng: venueLng,
          geoFenceRadius,
        }),
        credentials: 'include',
      });
      const newVenue: Venue = await res.json();
      setVenues(prev => [...prev, newVenue]);
      setSelectedVenueId(newVenue.id);
      setShowNewVenueForm(false);
      // Reset for next time
      setVenueSearch('');
      setVenueName('');
      setVenueAddress('');
      setVenueLat(null);
      setVenueLng(null);
      setGeoFenceRadius(150);
    } finally {
      setCreatingVenue(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          startTime: new Date(startTime).toISOString(),
          venueId: selectedVenueId || null,
        }),
        credentials: 'include',
      });
      const room = await res.json();
      onRoomCreated(room);
      setName('');
      setStartTime(getDefaultStartTime());
      setSelectedVenueId('');
    } finally {
      setLoading(false);
    }
  }

  const startTimeIsValid = startTime && new Date(startTime) > new Date();

  return (
    <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
      {/* Event name + start time */}
      <div className='flex flex-col gap-3 sm:flex-row'>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder='Room name (e.g. Saturday Night)'
          className='flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
        />
        <div className='flex flex-col gap-1 min-w-0 sm:w-auto'>
          <label className='text-xs text-gray-500 sm:hidden'>Start time</label>
          <input
            type='datetime-local'
            value={startTime}
            min={getNowInput()}
            onChange={e => setStartTime(e.target.value)}
            className='min-w-0 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
          />
        </div>
      </div>

      {/* Venue selector */}
      <div className='relative'>
        <select
          value={showNewVenueForm ? 'new' : selectedVenueId}
          onChange={e => handleVenueDropdownChange(e.target.value)}
          className='w-full appearance-none bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
        >
          <option value=''>No venue</option>
          {venues.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
          <option value='new'>+ Add new venue...</option>
        </select>
        <svg
          className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400'
          width='16' height='16' viewBox='0 0 24 24'
          fill='none' stroke='currentColor' strokeWidth='2.5'
          strokeLinecap='round' strokeLinejoin='round'
        >
          <polyline points='6 9 12 15 18 9' />
        </svg>
      </div>

      {/* Inline new venue form */}
      {showNewVenueForm && (
        <div className='flex flex-col gap-3 bg-gray-900 border border-gray-700 rounded-xl p-4'>
          <p className='text-xs text-gray-400'>Search for the venue or use your current location</p>

          {/* Custom autocomplete — React-controlled input + styled dropdown */}
          <div className='relative'>
            <input
              type='text'
              value={venueSearch}
              onChange={e => handleVenueSearch(e.target.value)}
              placeholder={mapsReady ? 'Search for a venue (e.g. Fabric London)' : 'Loading search…'}
              disabled={!mapsReady}
              className='w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm disabled:opacity-50'
            />
            {predictions.length > 0 && (
              <ul className='absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl'>
                {predictions.map((s, i) => (
                  <li
                    key={i}
                    // onMouseDown keeps focus on the input so the dropdown doesn't
                    // disappear before the click registers
                    onMouseDown={e => { e.preventDefault(); handlePredictionSelect(s); }}
                    className='px-4 py-3 cursor-pointer hover:bg-gray-700 border-b border-gray-700 last:border-b-0 transition-colors'
                  >
                    <p className='text-sm text-white font-medium'>
                      {s.placePrediction?.mainText?.text}
                    </p>
                    {s.placePrediction?.secondaryText?.text && (
                      <p className='text-xs text-gray-400 mt-0.5'>
                        {s.placePrediction.secondaryText.text}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Use my location fallback */}
          <button
            type='button'
            onClick={handleUseMyLocation}
            disabled={locatingUser}
            className='flex items-center gap-2 text-sm text-accent hover:text-white transition-colors disabled:opacity-50 cursor-pointer w-fit'
          >
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
              <circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3'/>
            </svg>
            {locatingUser ? 'Getting location...' : 'Use my current location'}
          </button>

          {/* Show resolved address / coords */}
          {venueLat !== null && venueLng !== null && (
            <p className='text-xs text-gray-500'>
              📍 {venueAddress || `${venueLat.toFixed(5)}, ${venueLng.toFixed(5)}`}
            </p>
          )}

          {/* Venue name — auto-filled by selection, editable */}
          <input
            value={venueName}
            onChange={e => setVenueName(e.target.value)}
            placeholder='Venue name'
            className='w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
          />

          {/* Geofence radius */}
          <div className='flex items-center gap-3'>
            <label className='text-xs text-gray-400 shrink-0'>Geofence radius</label>
            <input
              type='number'
              value={geoFenceRadius}
              min={50}
              max={1000}
              onChange={e => setGeoFenceRadius(Number(e.target.value))}
              className='w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm'
            />
            <span className='text-xs text-gray-500'>metres</span>
          </div>

          {/* Save venue — adds it to the dropdown and auto-selects it */}
          <button
            type='button'
            onClick={handleCreateVenue}
            disabled={creatingVenue || !venueName || venueLat === null || venueLng === null}
            className='w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-3 rounded-xl transition-colors cursor-pointer text-sm'
          >
            {creatingVenue ? 'Saving venue...' : 'Create venue'}
          </button>
        </div>
      )}

      <button
        type='submit'
        disabled={loading || !name || !startTimeIsValid || showNewVenueForm}
        className='w-full bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold px-5 py-3 rounded-xl transition-colors cursor-pointer text-sm'
      >
        {loading ? 'Creating...' : 'Create Room'}
      </button>
    </form>
  );
}

export default CreateRoomForm;
