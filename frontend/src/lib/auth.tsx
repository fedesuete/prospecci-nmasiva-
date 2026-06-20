'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export interface AuthUser {
  id: string | null;
  email: string;
  name: string;
  role: 'admin' | 'agent';
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Rutas permitidas para empleados (rol agent)
const AGENT_ALLOWED = ['/inbox'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // Verificar sesión al cargar
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((u: AuthUser) => setUser(u))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  // Guard de rutas según sesión y rol
  useEffect(() => {
    if (loading) return;

    if (!user && pathname !== '/login') {
      router.replace('/login');
      return;
    }
    if (user && pathname === '/login') {
      router.replace(user.role === 'agent' ? '/inbox' : '/');
      return;
    }
    if (
      user?.role === 'agent' &&
      pathname !== '/login' &&
      !AGENT_ALLOWED.some((p) => pathname.startsWith(p))
    ) {
      router.replace('/inbox');
    }
  }, [user, loading, pathname, router]);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || 'No se pudo iniciar sesión');
    }
    const data = await res.json();
    localStorage.setItem('token', data.token);
    setUser(data.user);
    router.replace(data.user.role === 'agent' ? '/inbox' : '/');
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    router.replace('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
