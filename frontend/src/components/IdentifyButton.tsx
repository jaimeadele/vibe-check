import { useState } from 'react';
import { useAudioCapture } from '../hooks/useAudioCapture';

type IdentifyState = 'idle' | 'checking_location' | 'not_at_venue' | 'listening' | 'processing' | 'match' | 'duplicate' | 'no_match' | 'error';

interface Song {
  title: string;
  artist: string;
  duplicate?: boolean;
}

interface Props {
  eventId: string;
  roomLocked: boolean;
  eventActive: boolean;
  venueId: string | null;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    }),
  );
}

function IdentifyButton({ eventId, roomLocked, eventActive, venueId }: Props) {
  const [state, setState] = useState<IdentifyState>('idle');
  const [match, setMatch] = useState<Song | null>(null);
  const { capture, cancel } = useAudioCapture();

  async function handleCancel() {
    cancel();
    setState('idle');
    // Release the lock so others can identify — best-effort, don't block UI
    await fetch(`/api/events/${eventId}/identify/lock`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(() => {});
  }

  async function handleClick() {
    // Tapping during listening cancels the recording
    if (state === 'listening') {
      await handleCancel();
      return;
    }

    if (state === 'processing' || state === 'checking_location' || roomLocked) return;

    // Geofence check — fresh on every tap so leaving the venue blocks future identifies
    if (venueId) {
      setState('checking_location');
      try {
        const pos = await getPosition();
        const geoRes = await fetch(`/api/venues/validate-location/${eventId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          credentials: 'include',
        });
        const geoData = await geoRes.json();
        if (!geoData.withinFence) {
          setState('not_at_venue');
          setTimeout(() => setState('idle'), 3000);
          return;
        }
      } catch {
        setState('not_at_venue');
        setTimeout(() => setState('idle'), 3000);
        return;
      }
    }

    try {
      const lockRes = await fetch(`/api/events/${eventId}/identify/lock`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!lockRes.ok) {
        setState('error');
        setTimeout(() => setState('idle'), 3000);
        return;
      }

      setState('listening');
      const blob = await capture(8000);
      setState('processing');

      const form = new FormData();
      form.append('audio', blob, 'sample.webm');

      const res = await fetch(`/api/events/${eventId}/identify`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });

      if (res.ok) {
        const song: Song = await res.json();
        setMatch(song);
        setState(song.duplicate ? 'duplicate' : 'match');
        setTimeout(() => setState('idle'), 5000);
      } else if (res.status === 422) {
        setState('no_match');
        setTimeout(() => setState('idle'), 3000);
      } else {
        setState('error');
        setTimeout(() => setState('idle'), 3000);
      }
    } catch (err) {
      // AbortError means the user cancelled — just go back to idle
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState('idle');
      } else {
        setState('error');
        setTimeout(() => setState('idle'), 3000);
      }
    }
  }

  const isActive = state === 'processing' || state === 'checking_location' || !eventActive || (roomLocked && state !== 'listening');

  const config: Record<IdentifyState, { label: string; style: string }> = {
    idle: {
      label: !eventActive ? 'Event not active' : roomLocked ? 'Identifying...' : 'Identify Song',
      style: !eventActive ? 'bg-gray-800 text-gray-500' : 'bg-accent hover:bg-accent-hover text-black',
    },
    checking_location: {
      label: 'Checking location…',
      style: 'bg-gray-700 text-white',
    },
    not_at_venue: {
      label: 'You must be at the venue',
      style: 'bg-gray-800 text-red-400',
    },
    listening: {
      label: 'Listening... tap to cancel',
      style: 'bg-accent text-black animate-pulse',
    },
    processing: {
      label: 'Identifying...',
      style: 'bg-gray-700 text-white',
    },
    match: {
      label: match ? `${match.title} — ${match.artist}` : 'Match found',
      style: 'bg-gray-800 text-accent',
    },
    duplicate: {
      label: match ? `Already playing — ${match.title}` : 'Already on the list',
      style: 'bg-gray-800 text-yellow-400',
    },
    no_match: {
      label: 'No match found',
      style: 'bg-gray-800 text-gray-400',
    },
    error: {
      label: 'Something went wrong',
      style: 'bg-gray-800 text-red-400',
    },
  };

  const { label, style } = config[state];

  return (
    <button
      onClick={handleClick}
      disabled={isActive}
      className={`w-full py-4 rounded-xl font-semibold text-sm tracking-wide transition-all disabled:cursor-not-allowed ${style}`}
    >
      {label}
    </button>
  );
}

export default IdentifyButton;
