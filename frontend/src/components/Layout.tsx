import { useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import SignInModal from './SignInModal';

interface Props {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  backTo?: string;
}

export default function Layout({ children, title = 'Vibe Check', subtitle, backTo }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [signinOpen, setSigninOpen] = useState(false);

  return (
    <div className='min-h-screen bg-gray-950 flex flex-col items-center py-8 sm:py-12'>
      <div className='w-full max-w-lg px-4'>

        {/* Header */}
        <div className='flex items-start justify-between mb-10'>
          <div>
            {backTo && (
              <button
                onClick={() => navigate(backTo)}
                className='flex items-center gap-1.5 text-gray-500 hover:text-white text-sm transition-colors cursor-pointer mb-2'
              >
                <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                  <polyline points='15 18 9 12 15 6'/>
                </svg>
                Back
              </button>
            )}
            <h1 className='text-4xl font-bold text-white tracking-tight mb-1'>{title}</h1>
            {subtitle && <p className='text-gray-400'>{subtitle}</p>}
          </div>

          <div className='pt-1 shrink-0 ml-4'>
            {user ? (
              <div className='flex items-center gap-3 text-sm'>
                <span className='text-accent'>{user.role}</span>
                {user.role === 'ADMIN' && (
                  <button
                    onClick={() => navigate('/admin')}
                    className='text-gray-500 hover:text-white transition-colors cursor-pointer'
                  >
                    Admin
                  </button>
                )}
                <button
                  onClick={logout}
                  className='text-gray-500 hover:text-white transition-colors cursor-pointer'
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSigninOpen(true)}
                className='bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors cursor-pointer'
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        {children}
      </div>

      {signinOpen && <SignInModal onClose={() => setSigninOpen(false)} />}
    </div>
  );
}
