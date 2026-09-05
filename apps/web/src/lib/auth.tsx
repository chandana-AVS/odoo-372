import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { api, getToken, setToken } from './api';

export type Role =
  | 'EMPLOYEE'
  | 'HR_MANAGER'
  | 'HR_PAYROLL_USER'
  | 'HR_PAYROLL_MANAGER'
  | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  roles: Role[];
  employeeId: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    department: string | null;
    jobPosition: string | null;
  } | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...roles: Role[]) => boolean;
  isEmployeeOnly: boolean;
}

const AuthContext = React.createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setTokenState] = React.useState<string | null>(getToken());

  const { data: user, isLoading } = useQuery({
    queryKey: ['me', token],
    queryFn: () => api.get<SessionUser>('/auth/me'),
    enabled: Boolean(token),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const login = React.useCallback(
    async (email: string, password: string) => {
      const result = await api.post<{ accessToken: string; user: SessionUser }>(
        '/auth/login',
        { email, password },
      );
      setToken(result.accessToken);
      setTokenState(result.accessToken);
      queryClient.setQueryData(['me', result.accessToken], result.user);
    },
    [queryClient],
  );

  const logout = React.useCallback(() => {
    setToken(null);
    setTokenState(null);
    queryClient.clear();
  }, [queryClient]);

  const can = React.useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (user.roles.includes('ADMIN')) return true;
      return roles.some((role) => user.roles.includes(role));
    },
    [user],
  );

  const value: AuthContextValue = {
    user: user ?? null,
    loading: Boolean(token) && isLoading,
    login,
    logout,
    can,
    isEmployeeOnly: Boolean(user && user.roles.length === 1 && user.roles[0] === 'EMPLOYEE'),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => React.useContext(AuthContext);

/** Roles that may see any payroll screen at all. */
export const PAYROLL_ROLES: Role[] = ['HR_PAYROLL_USER', 'HR_PAYROLL_MANAGER'];
/** Roles that may write payroll configuration. */
export const PAYROLL_ADMIN: Role[] = ['HR_PAYROLL_MANAGER'];
/** Roles with HR master-data access. */
export const HR_ROLES: Role[] = ['HR_MANAGER', 'HR_PAYROLL_USER', 'HR_PAYROLL_MANAGER'];
