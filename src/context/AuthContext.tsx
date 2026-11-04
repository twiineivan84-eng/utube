import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Branch, PermissionCode, AuthSession } from '../types';
import { apiClient } from '../api/client';

interface AuthContextType {
  user: User | null;
  workingBranch: Branch | null;
  effectivePermissions: PermissionCode[];
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasPermission: (permission: PermissionCode) => boolean;
  hasAnyPermission: (permissions: PermissionCode[]) => boolean;
  hasAllPermissions: (permissions: PermissionCode[]) => boolean;
  login: (branchId: string, username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  switchBranch: (branchId: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workingBranch, setWorkingBranch] = useState<Branch | null>(null);
  const [effectivePermissions, setEffectivePermissions] = useState<PermissionCode[]>([]);
  const [token, setToken] = useState<string | null>(apiClient.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const applySession = (session: AuthSession) => {
    setUser(session.user);
    setWorkingBranch(session.workingBranch);
    setEffectivePermissions(session.effectivePermissions || []);
    setToken(session.token);
    apiClient.setToken(session.token);
    // Cache for offline authorization fallback
    localStorage.setItem('turihamwe_token', session.token);
    localStorage.setItem('turihamwe_auth_token', session.token);
    localStorage.setItem('turihamwe_cached_user', JSON.stringify(session.user));
    localStorage.setItem('turihamwe_cached_branch', JSON.stringify(session.workingBranch));
    localStorage.setItem('turihamwe_cached_perms', JSON.stringify(session.effectivePermissions));
  };

  const clearSession = () => {
    setUser(null);
    setWorkingBranch(null);
    setEffectivePermissions([]);
    setToken(null);
    apiClient.setToken(null);
    localStorage.removeItem('turihamwe_token');
    localStorage.removeItem('turihamwe_auth_token');
    localStorage.removeItem('turihamwe_cached_user');
    localStorage.removeItem('turihamwe_cached_branch');
    localStorage.removeItem('turihamwe_cached_perms');
  };

  const refreshSession = useCallback(async () => {
    const currentToken = apiClient.getToken();
    if (!currentToken) {
      clearSession();
      setIsLoading(false);
      return;
    }

    try {
      const res = await apiClient.verifyToken();
      if (res.valid && res.session) {
        applySession(res.session);
      } else {
        // Server is reachable and explicitly confirmed token is invalid
        clearSession();
      }
    } catch {
      // Genuine network failure (browser offline)
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cachedUserStr = localStorage.getItem('turihamwe_cached_user');
        const cachedBranchStr = localStorage.getItem('turihamwe_cached_branch');
        const cachedPermsStr = localStorage.getItem('turihamwe_cached_perms');

        if (cachedUserStr && cachedBranchStr && cachedPermsStr) {
          try {
            setUser(JSON.parse(cachedUserStr));
            setWorkingBranch(JSON.parse(cachedBranchStr));
            setEffectivePermissions(JSON.parse(cachedPermsStr));
          } catch {
            clearSession();
          }
        } else {
          clearSession();
        }
      } else {
        clearSession();
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession();
    };

    window.addEventListener('turihamwe_session_expired', handleSessionExpired);
    return () => {
      window.removeEventListener('turihamwe_session_expired', handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (branchId: string, username: string, password: string) => {
    try {
      const res = await apiClient.login(branchId, username, password);
      if (res.success && res.session) {
        applySession(res.session);
        return { success: true };
      }
      return { success: false, message: 'Invalid credentials or branch access denied' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication service error';
      return { success: false, message };
    }
  };

  const switchBranch = async (branchId: string) => {
    try {
      const res = await apiClient.switchBranch(branchId);
      if (res.success && res.session) {
        applySession(res.session);
        return { success: true };
      }
      return { success: false, message: 'Failed to switch working branch.' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Branch switch error';
      return { success: false, message };
    }
  };

  const logout = async () => {
    await apiClient.logout();
    clearSession();
  };

  const hasPermission = (permission: PermissionCode): boolean => {
    return effectivePermissions.includes(permission);
  };

  const hasAnyPermission = (permissions: PermissionCode[]): boolean => {
    return permissions.some(p => effectivePermissions.includes(p));
  };

  const hasAllPermissions = (permissions: PermissionCode[]): boolean => {
    return permissions.every(p => effectivePermissions.includes(p));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workingBranch,
        effectivePermissions,
        token,
        isAuthenticated: !!user && !!workingBranch,
        isLoading,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        login,
        switchBranch,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
