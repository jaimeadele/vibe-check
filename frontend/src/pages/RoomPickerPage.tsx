import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { formatStartTime } from '../lib/format';

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
}

const statusStyle = {
  ACTIVE: 'bg-green-500/20 text-green-400',
  UPCOMING: 'bg-blue-500/20 text-blue-400',
  CLOSED: 'bg-gray-700 text-gray-400',
};

export default function RoomPickerPage() {
  const { slug, eventId } = useParams<{ slug: string; eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/operators/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) { setNotFound(true); return; }
        const found = data.operator.events.find((e: Event) => e.id === eventId);
        if (!found) { setNotFound(true); return; }
        setEvent(found);
      })
      .finally(() => setLoading(false));
  }, [slug, eventId]);

  if (loading) {
    return <Layout backTo={`/${slug}`}><p className='text-gray-600 text-sm text-center py-12'>Loading…</p></Layout>;
  }

  if (notFound || !event) {
    return (
      <Layout title='Not found' backTo={`/${slug}`}>
        <p className='text-gray-600 text-sm text-center py-12'>Event not found</p>
      </Layout>
    );
  }

  return (
    <Layout title={event.name} subtitle='Choose a room' backTo={`/${slug}`}>
      <div className='mb-6'>
        <p className='text-gray-400 text-sm'>{formatStartTime(event.startTime)}</p>
        {event.venue && <p className='text-gray-400 text-sm mt-0.5'>📍 {event.venue.name}</p>}
      </div>

      <ul className='flex flex-col gap-3'>
        {event.rooms.map(room => (
          <li key={room.id}>
            <button
              onClick={() => navigate(`/${slug}/room/${room.roomCode}`)}
              className='w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl px-5 py-4 transition-colors cursor-pointer text-left'
            >
              <div>
                <p className='text-white font-medium'>{room.name}</p>
                {room.djs.length > 0 && (
                  <p className='text-gray-500 text-xs mt-0.5'>
                    DJ: {room.djs.map(d => d.user.name).join(', ')}
                  </p>
                )}
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ml-3 ${statusStyle[room.status]}`}>
                {room.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Layout>
  );
}
