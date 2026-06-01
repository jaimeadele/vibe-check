import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect non-admins away as soon as we know who the user is
  useEffect(() => {
    if (user !== null && user.role !== 'ADMIN') {
      navigate('/');
    }
  }, [user, navigate]);

  return (
    <Layout title='Admin' subtitle='Manage operators' backTo='/'>
      <p className='text-gray-500 text-sm'>Admin panel — coming in Step 9</p>
    </Layout>
  );
}
