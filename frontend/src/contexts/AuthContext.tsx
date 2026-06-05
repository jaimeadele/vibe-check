import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export interface AuthUser {
  userId: string;
  role: 'USER' | 'OPERATOR' | 'ADMIN';
}

interface AuthContextType {
  user: AuthUser | null;
  isPrivileged: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

// The "pipe" — just a typed container, no value yet
const AuthContext = createContext<AuthContextType | null>(null);

// AuthProvider owns the auth state and exposes it to every descendant
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  // On mount: check if a valid session cookie exists
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setUser({ userId: data.userId, role: data.role });
      })
      .catch(() => {});
  }, []);

  const isPrivileged = user?.role === 'OPERATOR' || user?.role === 'ADMIN';

  async function login(email: string, password: string): Promise<boolean> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    // login endpoint returns 'id', /me returns 'userId' — normalise here
    setUser({ userId: data.id, role: data.role });
    return true;
  }

  function logout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isPrivileged, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// useAuth() — how any component reads from the pipe
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
