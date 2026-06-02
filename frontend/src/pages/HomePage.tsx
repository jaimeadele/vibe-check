import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

interface Operator {
  id: string;
  name: string;
  slug: string;
  activeEventCount: number;
}

export default function HomePage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/operators')
      .then(r => r.json())
      .then(data => setOperators(data.operators ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = operators.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout subtitle='Find a live event near you'>

      <input
        type='text'
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder='Search operators…'
        className='w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm mb-6'
      />

      {loading ? (
        <p className='text-gray-600 text-sm text-center py-12'>Loading…</p>
      ) : filtered.length === 0 ? (
        <p className='text-gray-600 text-sm text-center py-12'>
          {search ? 'No operators match your search' : 'No operators yet'}
        </p>
      ) : (
        <ul className='flex flex-col gap-3'>
          {filtered.map(op => (
            <li key={op.id}>
              <button
                onClick={() => navigate(`/${op.slug}`)}
                className='w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-xl px-5 py-4 transition-colors cursor-pointer text-left'
              >
                <div>
                  <p className='text-white font-medium'>{op.name}</p>
                  <p className='text-gray-500 text-xs mt-0.5'>/{op.slug}</p>
                </div>
                {op.activeEventCount > 0 && (
                  <span className='text-xs font-medium bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full shrink-0 ml-3'>
                    {op.activeEventCount} {op.activeEventCount === 1 ? 'event' : 'events'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

    </Layout>
  );
}
