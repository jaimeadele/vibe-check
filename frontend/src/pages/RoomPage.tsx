import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import RoomView from '../components/RoomView';

interface Song {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  spotifyId: string | null;
  identifiedAt: string;
  vibeScore: number;
  reactionCount: number;
  breakdown: Record<string, number>;
}

interface SetlistData {
  room: {
    id: string;
    name: string;
    roomCode: string;
    status: 'UPCOMING' | 'ACTIVE' | 'CLOSED';
    djs: { id: string; name: string }[];
  };
  event: {
    id: string;
    name: string;
    startTime: string;
    operatorId: string;
    venue: { id: string; name: string; address: string | null } | null;
  };
  songs: Song[];
  isPrivileged: boolean;
}

export default function RoomPage() {
  const { slug, roomCode } = useParams<{ slug: string; roomCode: string }>();
  const [data, setData] = useState<SetlistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!roomCode) return;
    fetch(`/api/rooms/${roomCode}/setlist`)
      .then(r => { if (!r.ok) { setNotFound(true); return null; } return r.json(); })
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [roomCode]);

  if (loading) {
    return (
      <Layout backTo={`/${slug}`}>
        <p className='text-gray-600 text-sm text-center py-12'>Loading…</p>
      </Layout>
    );
  }

  if (notFound || !data) {
    return (
      <Layout title='Not found' backTo={`/${slug}`}>
        <p className='text-gray-600 text-sm text-center py-12'>Room not found</p>
      </Layout>
    );
  }

  return (
    <RoomView
      room={data.room}
      event={data.event}
      initialSongs={data.songs}
      isPrivileged={data.isPrivileged}
      slug={slug!}
    />
  );
}
