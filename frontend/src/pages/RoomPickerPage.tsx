import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';

export default function RoomPickerPage() {
  const { slug, eventId } = useParams<{ slug: string; eventId: string }>();

  return (
    <Layout title='Choose a room' backTo={`/${slug}`}>
      <p className='text-gray-500 text-sm'>Room picker for event {eventId} — coming in Step 7</p>
    </Layout>
  );
}
