import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AuthStatus, AuthUser, Business } from '../api/types';

interface AuthCtx {
  status: AuthStatus | undefined;
  loading: boolean;
  error: unknown;
  user: AuthUser | null;
  business: Business | null;
  isAdmin: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['auth-status'], queryFn: () => api.get<AuthStatus>('/api/auth/status'), staleTime: 60_000, retry: false });
  const value: AuthCtx = {
    status: q.data,
    loading: q.isLoading,
    error: q.error,
    user: q.data?.user ?? null,
    business: q.data?.business ?? null,
    isAdmin: q.data?.user?.role === 'admin',
    refresh: () => qc.invalidateQueries({ queryKey: ['auth-status'] }),
    logout: async () => {
      await api.post('/api/auth/logout');
      qc.clear();
      await qc.invalidateQueries({ queryKey: ['auth-status'] });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AuthProvider ausente');
  return ctx;
}
