import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiException, apiGet, apiPost, sessionEvents } from '../lib/apiClient';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { tokenStorage } from '../lib/tokenStorage';

export interface AdminUser {
  id: string;
  fullName: string;
  full_name?: string;
  email?: string;
  phone?: string;
  roles: string[];
  permissions: string[];
}

/** Roles from the Phase 1 RBAC seed permitted to sign into the back office. */
const STAFF_ROLES = ['super_admin', 'admin', 'support_agent'];

type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AdminUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const [user, setUser] = useState<AdminUser | null>(null);

  const hydrate = useCallback(async () => {
    if (!tokenStorage.getAccessToken()) {
      setStatus('unauthenticated');
      return;
    }
    try {
      const me = await apiGet<AdminUser>('/auth/me');
      if (!me.roles.some(role => STAFF_ROLES.includes(role))) throw new Error('Staff access required');
      setUser({ ...me, fullName: me.fullName || me.full_name || 'Team member' });
      setStatus('authenticated');
      connectSocket();
    } catch {
      tokenStorage.clear();
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    void hydrate();
    const onUnauthorized = () => {
      setUser(null);
      setStatus('unauthenticated');
      disconnectSocket();
    };
    sessionEvents.addEventListener('unauthorized', onUnauthorized);
    return () => sessionEvents.removeEventListener('unauthorized', onUnauthorized);
  }, [hydrate]);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await apiPost<{
      user: Omit<AdminUser, 'permissions' | 'roles'>;
      tokens: { accessToken: string; refreshToken: string };
    }>('/auth/login', { identifier, password });

    tokenStorage.saveTokens(result.tokens.accessToken, result.tokens.refreshToken);
    const me = await apiGet<AdminUser>('/auth/me');

    if (!me.roles.some((role) => STAFF_ROLES.includes(role))) {
      tokenStorage.clear();
      throw new ApiException('This account does not have admin panel access.', { code: 'FORBIDDEN' });
    }

    setUser({ ...me, fullName: me.fullName || me.full_name || 'Team member' });
    setStatus('authenticated');
    connectSocket();
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (refreshToken) {
      try {
        await apiPost('/auth/logout', { refreshToken });
      } catch {
        // Best-effort — clear local session regardless of server response.
      }
    }
    tokenStorage.clear();
    setUser(null);
    setStatus('unauthenticated');
    disconnectSocket();
  }, []);

  const hasPermission = useCallback(
    (permission: string) => Boolean(user?.roles.includes('super_admin') || user?.permissions.includes(permission)),
    [user],
  );

  const value = useMemo(
    () => ({ status, user, login, logout, hasPermission }),
    [status, user, login, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
