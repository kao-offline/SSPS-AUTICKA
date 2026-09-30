'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';

interface UserData {
  role?: string;
  createdAt?: string;
  permissions?: string[];
  isActive?: boolean;
  plugins?: string; // Comma-separated list of plugin names
  [key: string]: any;
}

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  userData: UserData | null;
  userId: string | null;
  userImage: string | null;
  login: (username: string, userData: UserData, userId: string) => void; // Deprecated
  logout: () => void;
  refreshUserData: () => void; // No-op with Convex's reactive queries
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { signOut } = useAuthActions();

  // Fetch current user data if authenticated
  const currentUser = useQuery(api.users.currentUser, isAuthenticated ? {} : "skip");

  // Create derived state
  const { username, userId, userData, userImage } = useMemo(() => {
    if (!currentUser) {
      return { username: null, userId: null, userData: null, userImage: null };
    }

    const { username, _id, imageUrl, ...rest } = currentUser as any;

    const userDataObj: UserData = {
      ...rest,
      role: rest.role,
    };

    return {
      username: username || 'User',
      userId: _id,
      userData: userDataObj,
      userImage: imageUrl || null,
    };
  }, [currentUser]);

  const isLoading = isAuthLoading || (isAuthenticated && currentUser === undefined);

  const login = () => {
    console.warn('AuthContext.login is deprecated. Use Convex Auth instead.');
  };

  const logout = async () => {
    await signOut();
    // Optional: Redirect handled by components or router
  };

  const refreshUserData = () => {
    // Convex queries update automatically, this is a no-op
    // We could invalidate the query if needed, but usually not necessary
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      username,
      userData,
      userId,
      userImage,
      login,
      logout,
      refreshUserData,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
