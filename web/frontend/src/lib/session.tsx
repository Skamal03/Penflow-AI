import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Role, User } from './types';

type SessionValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: { email: string; password: string; displayName: string; accountType: string; acceptedTerms: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
  refresh: () => Promise<void>;
};

type SessionResponse = { user: User };
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const result = await api.get<{ user: User | null }>('/session');
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const value: SessionValue = {
    user,
    loading,
    refresh,
    signIn: async (email, password) => {
      const result = await api.post<SessionResponse>('/auth/login', { email, password });
      setUser(result.user);
    },
    signUp: async (payload) => {
      const result = await api.post<SessionResponse>('/auth/signup', payload);
      setUser(result.user);
    },
    signOut: async () => {
      await api.post('/auth/logout');
      setUser(null);
    },
    switchRole: async (role) => {
      const result = await api.post<SessionResponse>('/dev/role-switch', { role });
      setUser(result.user);
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider.');
  return session;
}
