import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';

export default function OperatorPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <Layout title={slug ?? ''} subtitle='Events' backTo='/'>
      <p className='text-gray-500 text-sm'>Operator event list — coming in Step 7</p>
    </Layout>
  );
}
