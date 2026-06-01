import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';

export default function RoomPage() {
  const { slug, roomCode } = useParams<{ slug: string; roomCode: string }>();

  return (
    <Layout title={roomCode ?? ''} subtitle='Setlist' backTo={`/${slug}`}>
      <p className='text-gray-500 text-sm'>Room view — coming in Step 8</p>
    </Layout>
  );
}
