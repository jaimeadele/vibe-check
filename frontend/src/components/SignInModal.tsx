import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onClose: () => void;
}

export default function SignInModal({ onClose }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const success = await login(email, password);
    if (success) {
      onClose();
    } else {
      setError(true);
    }
  }

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'
      onClick={onClose}
    >
      <div
        className='bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4'
        onClick={e => e.stopPropagation()}
      >
        <div className='flex items-center justify-between mb-5'>
          <h2 className='text-white font-semibold text-lg'>Sign in</h2>
          <button
            onClick={onClose}
            className='text-gray-500 hover:text-white transition-colors cursor-pointer'
            aria-label='Close'
          >
            <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
              <line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/>
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className='flex flex-col gap-3'>
          <input
            type='email'
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder='Email'
            autoFocus
            className='w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
          />
          <div className='relative'>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder='Password'
              className='w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-gray-500 focus:outline-none focus:border-accent transition-colors text-base sm:text-sm'
            />
            <button
              type='button'
              onClick={() => setShowPassword(p => !p)}
              className='absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer'
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                  <path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94'/>
                  <path d='M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19'/>
                  <line x1='1' y1='1' x2='23' y2='23'/>
                </svg>
              ) : (
                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                  <path d='M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'/>
                  <circle cx='12' cy='12' r='3'/>
                </svg>
              )}
            </button>
          </div>
          <button
            type='submit'
            disabled={!email || !password}
            className='w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm cursor-pointer'
          >
            Sign in
          </button>
          {error && (
            <p className='text-red-400 text-sm text-center'>Invalid email or password</p>
          )}
        </form>
      </div>
    </div>
  );
}
