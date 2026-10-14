import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
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
const KEY = ['auth-status'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<AuthStatus>('/api/auth/status'), staleTime: 60_000, retry: false, refetchOnWindowFocus: false });

  const markLoggedOut = async () => {
    // cancela respostas em voo que poderiam "ressuscitar" a sessão no cliente
    await qc.cancelQueries({ queryKey: KEY });
    qc.setQueryData<AuthStatus>(KEY, (old) => ({ needsSetup: old?.needsSetup ?? false, authenticated: false, user: null, business: null }));
    qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth-status' });
  };

  // Sessão expirada ou revogada em qualquer chamada: volta para o login.
  useEffect(() => {
    const onUnauthorized = () => {
      if (qc.getQueryData<AuthStatus>(KEY)?.authenticated) void markLoggedOut();
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthCtx = {
    status: q.data,
    loading: q.isLoading,
    error: q.error,
    user: q.data?.user ?? null,
    business: q.data?.business ?? null,
    isAdmin: q.data?.user?.role === 'admin',
    refresh: () => qc.invalidateQueries({ queryKey: KEY }),
    logout: async () => {
      try {
        await api.post('/api/auth/logout');
      } finally {
        await markLoggedOut();
      }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AuthProvider ausente');
  return ctx;
}
