/// <reference types="google.maps" />
import { useState, useEffect, useRef } from 'react';
import { loadMapsScript } from '../lib/maps';

export interface CreatedVenue {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  geoFenceRadius: number;
  isActive: boolean;
}

interface Props {
  onCreated: (venue: CreatedVenue) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

const inputClass =
  'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-sm';

export default function VenueCreationForm({ onCreated, onCancel, submitLabel = 'Create venue' }: Props) {
  // Maps + search
  const [mapsReady, setMapsReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(50);

  // Map picker
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [pickedLat, setPickedLat] = useState<number | null>(null);
  const [pickedLng, setPickedLng] = useState<number | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  // Submission
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMapsScript().then(() => setMapsReady(true)).catch(() => {});
  }, []);

  // Initialise map when the picker opens
  useEffect(() => {
    if (!showMapPicker || !mapsReady) return;

    // Defer until after the browser has painted the modal so the container
    // has real dimensions — especially important on mobile.
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      const initialCenter = (lat !== null && lng !== null)
        ? { lat, lng }
        : { lat: 51.5074, lng: -0.1278 }; // London fallback

      const map = new google.maps.Map(mapContainerRef.current, {
        zoom: 15,
        center: initialCenter,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        // 'greedy' lets the map capture all touch events inside the modal
        // on mobile; without it the scroll container intercepts taps.
        gestureHandling: 'greedy',
      });
      mapInstanceRef.current = map;

      // Pre-place pin if coords already set
      if (lat !== null && lng !== null) {
        markerRef.current = new google.maps.Marker({ position: initialCenter, map });
        setPickedLat(lat);
        setPickedLng(lng);
      }

      // Pan to user's current location and auto-drop pin
      if (lat === null && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          map.setCenter(userPos);
          if (markerRef.current) {
            markerRef.current.setPosition(userPos);
          } else {
            markerRef.current = new google.maps.Marker({ position: userPos, map });
          }
          setPickedLat(pos.coords.latitude);
          setPickedLng(pos.coords.longitude);
        });
      }

      // Tap / click to place or move the pin
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        setPickedLat(e.latLng.lat());
        setPickedLng(e.latLng.lng());
        if (markerRef.current) {
          markerRef.current.setPosition(e.latLng);
        } else {
          markerRef.current = new google.maps.Marker({ position: e.latLng, map });
        }
      });
    }, 50);

    return () => {
      clearTimeout(timer);
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMapPicker, mapsReady]);

  function cancelMapPicker() {
    setShowMapPicker(false);
    setPickedLat(null);
    setPickedLng(null);
  }

  function confirmMapLocation() {
    if (pickedLat === null || pickedLng === null) return;
    setLat(pickedLat);
    setLng(pickedLng);
    setShowMapPicker(false);
    setPickedLat(null);
    setPickedLng(null);
    // Reverse geocode to fill in address
    new google.maps.Geocoder().geocode(
      { location: { lat: pickedLat, lng: pickedLng } },
      (results, status) => {
        if (status === 'OK' && results?.[0]) setAddress(results[0].formatted_address);
      },
    );
  }

  async function handleSearch(input: string) {
    setSearchQuery(input);
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
        console.error('Autocomplete error:', err);
      }
    }, 300);
  }

  async function handlePredictionSelect(suggestion: google.maps.places.AutocompleteSuggestion) {
    if (!suggestion.placePrediction) return;
    setPredictions([]);
    const place = suggestion.placePrediction.toPlace();
    try {
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      const displayName = place.displayName ?? '';
      setSearchQuery(displayName);
      setName(displayName);
      setAddress(place.formattedAddress ?? '');
      if (place.location) {
        setLat(place.location.lat());
        setLng(place.location.lng());
      }
      sessionTokenRef.current = null;
      setError('');
    } catch (err) {
      console.error('fetchFields error:', err);
    }
  }

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!name.trim() || lat === null || lng === null) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), address: address || null, lat, lng, geoFenceRadius: radius }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create venue'); return; }
      setSearchQuery(''); setName(''); setAddress(''); setLat(null); setLng(null); setRadius(150);
      onCreated(data);
    } catch {
      setError('Failed to create venue. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className='flex flex-col gap-3'>

        {/* Location search */}
        <div>
          <label className='block text-xs text-gray-500 mb-1'>Location</label>
          <div className='relative'>
            <input
              type='text'
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder={mapsReady ? 'Search for a venue (e.g. Dance USA)' : 'Loading search…'}
              disabled={!mapsReady}
              className={inputClass + ' disabled:opacity-50'}
            />
            {predictions.length > 0 && (
              <ul className='absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl'>
                {predictions.map((s, i) => (
                  <li
                    key={i}
                    onMouseDown={e => { e.preventDefault(); handlePredictionSelect(s); }}
                    className='px-4 py-3 cursor-pointer hover:bg-gray-700 border-b border-gray-700 last:border-b-0 transition-colors'
                  >
                    <p className='text-sm text-white font-medium'>{s.placePrediction?.mainText?.text}</p>
                    {s.placePrediction?.secondaryText?.text && (
                      <p className='text-xs text-gray-400 mt-0.5'>{s.placePrediction.secondaryText.text}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Drop a pin */}
        <button
          type='button'
          onClick={() => setShowMapPicker(true)}
          disabled={!mapsReady}
          className='flex items-center gap-2 text-sm text-accent hover:opacity-80 transition-opacity disabled:opacity-50 cursor-pointer w-fit'
        >
          <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
            <path d='M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'/><circle cx='12' cy='10' r='3'/>
          </svg>
          {mapsReady ? 'Drop a pin' : 'Loading map…'}
        </button>

        {/* Resolved location */}
        {lat !== null && lng !== null && (
          <p className='text-xs text-gray-500'>
            📍 {address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
          </p>
        )}

        {/* Venue name */}
        <div>
          <label className='block text-xs text-gray-500 mb-1'>Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder='Venue name'
            className={inputClass}
          />
        </div>

        {/* Geofence radius */}
        <div className='flex items-center gap-3'>
          <label className='text-xs text-gray-400 shrink-0'>Geofence radius</label>
          <input
            type='number'
            value={radius}
            min={50}
            max={1000}
            onChange={e => setRadius(Number(e.target.value))}
            className='w-24 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm'
          />
          <span className='text-xs text-gray-500'>metres</span>
        </div>

        {error && <p className='text-red-400 text-sm'>{error}</p>}

        <div className='flex gap-2'>
          <button
            type='submit'
            disabled={!name.trim() || lat === null || lng === null || creating}
            className={`${onCancel ? 'flex-1' : 'w-full'} bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer`}
          >
            {creating ? 'Creating…' : submitLabel}
          </button>
          {onCancel && (
            <button
              type='button'
              onClick={onCancel}
              className='flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer'
            >
              Cancel
            </button>
          )}
        </div>

      </form>

      {/* Map picker modal */}
      {showMapPicker && (
        <div className='fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70'>
          <div className='bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden flex flex-col'>

            {/* Header */}
            <div className='flex items-center justify-between px-4 py-3 border-b border-gray-800'>
              <p className='text-white font-medium text-sm'>Choose location</p>
              <button
                type='button'
                onClick={cancelMapPicker}
                className='text-gray-400 hover:text-white text-sm transition-colors cursor-pointer'
              >
                Cancel
              </button>
            </div>

            {/* Map */}
            <div ref={mapContainerRef} className='h-72' />

            {/* Footer */}
            <div className='flex items-center justify-between px-4 py-3 border-t border-gray-800'>
              <p className='text-xs text-gray-500'>
                {pickedLat !== null && pickedLng !== null
                  ? `${pickedLat.toFixed(5)}, ${pickedLng.toFixed(5)}`
                  : 'Tap the map to place a pin'}
              </p>
              <button
                type='button'
                onClick={confirmMapLocation}
                disabled={pickedLat === null || pickedLng === null}
                className='bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold px-4 py-2 rounded-xl text-sm cursor-pointer transition-colors'
              >
                Confirm location
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
