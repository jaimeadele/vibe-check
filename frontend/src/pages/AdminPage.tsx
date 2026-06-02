import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

interface Operator {
  id: string;
  name: string;
  slug: string;
  activeEventCount: number;
}

function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm';

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [operators, setOperators] = useState<Operator[]>([]);

  // Create form
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    if (user !== null && user.role !== 'ADMIN') navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    fetch('/api/operators')
      .then(r => r.json())
      .then(data => setOperators(data.operators ?? []));
  }, []);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(toSlug(value));
  }

  function handleSlugChange(value: string) {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
    setSlugEdited(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setCreateSuccess(null);

    try {
      const res = await fetch('/api/auth/register-operator', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, slug }),
      });
      const data = await res.json();

      if (!res.ok) { setCreateError(data.error ?? 'Something went wrong'); return; }

      setCreateSuccess(`Operator "${data.name}" created — /${data.slug}`);
      setOperators(prev => [...prev, { id: data.id, name: data.name, slug: data.slug, activeEventCount: 0 }]);
      setName(''); setSlug(''); setSlugEdited(false); setEmail(''); setPassword('');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(op: Operator) {
    setEditingId(op.id);
    setEditName(op.name);
    setEditSlug(op.slug ?? '');
    setEditEmail('');
    setEditPassword('');
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSave(op: Operator) {
    setSaving(true);
    setEditError(null);

    try {
      const body: Record<string, string> = {};
      if (editName !== op.name) body.name = editName;
      if (editSlug !== op.slug) body.slug = editSlug;
      if (editEmail) body.email = editEmail;
      if (editPassword) body.password = editPassword;

      const res = await fetch(`/api/operators/${op.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) { setEditError(data.error ?? 'Something went wrong'); return; }

      setOperators(prev => prev.map(o =>
        o.id === op.id ? { ...o, name: data.name, slug: data.slug } : o
      ));
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title='Admin' subtitle='Manage operators' backTo='/'>

      {/* Create operator form */}
      <div className='bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8'>
        <h2 className='text-white font-semibold mb-4'>Create operator account</h2>
        <form onSubmit={handleCreate} className='flex flex-col gap-3'>
          <input
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder='Display name'
            className={inputClass}
          />
          <div>
            <input
              value={slug}
              onChange={e => handleSlugChange(e.target.value)}
              placeholder='URL slug'
              className={inputClass}
            />
            <p className='text-xs text-gray-600 mt-1 pl-1'>
              /{slug || 'slug'} · lowercase letters, digits, hyphens · 3–40 chars
            </p>
          </div>
          <input
            type='email'
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder='Email'
            className={inputClass}
          />
          <input
            type='password'
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder='Password'
            className={inputClass}
          />
          <button
            type='submit'
            disabled={!name.trim() || !slug.trim() || !email.trim() || !password.trim() || creating}
            className='w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm cursor-pointer'
          >
            {creating ? 'Creating…' : 'Create operator'}
          </button>
          {createError && <p className='text-red-400 text-sm'>{createError}</p>}
          {createSuccess && <p className='text-green-400 text-sm'>{createSuccess}</p>}
        </form>
      </div>

      {/* Operator list */}
      <h2 className='text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4'>
        All operators
      </h2>
      {operators.length === 0 ? (
        <p className='text-gray-600 text-sm text-center py-8'>No operators yet</p>
      ) : (
        <ul className='flex flex-col gap-3'>
          {operators.map(op => (
            <li key={op.id}>
              {editingId === op.id ? (
                /* Edit form */
                <div className='bg-gray-900 border border-accent/40 rounded-xl px-5 py-4'>
                  <div className='flex flex-col gap-3'>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder='Display name'
                      className={inputClass}
                    />
                    <div>
                      <input
                        value={editSlug}
                        onChange={e => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder='URL slug'
                        className={inputClass}
                      />
                      <p className='text-xs text-gray-600 mt-1 pl-1'>/{editSlug || 'slug'}</p>
                    </div>
                    <input
                      type='email'
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder='New email (leave blank to keep current)'
                      className={inputClass}
                    />
                    <input
                      type='password'
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      placeholder='New password (leave blank to keep current)'
                      className={inputClass}
                    />
                    {editError && <p className='text-red-400 text-sm'>{editError}</p>}
                    <div className='flex gap-2'>
                      <button
                        onClick={() => handleSave(op)}
                        disabled={saving || !editName.trim() || !editSlug.trim()}
                        className='flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer'
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className='flex-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white font-semibold py-2.5 rounded-xl transition-colors text-sm cursor-pointer'
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Operator card */
                <div className='flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-4'>
                  <button
                    onClick={() => navigate(`/${op.slug}`)}
                    className='flex-1 text-left'
                  >
                    <p className='text-white font-medium'>{op.name}</p>
                    <p className='text-gray-500 text-xs mt-0.5'>/{op.slug}</p>
                  </button>
                  <div className='flex items-center gap-2 shrink-0 ml-3'>
                    {op.activeEventCount > 0 && (
                      <span className='text-xs font-medium bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full'>
                        {op.activeEventCount} {op.activeEventCount === 1 ? 'event' : 'events'}
                      </span>
                    )}
                    <button
                      onClick={() => startEdit(op)}
                      className='text-xs text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer'
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

    </Layout>
  );
}
