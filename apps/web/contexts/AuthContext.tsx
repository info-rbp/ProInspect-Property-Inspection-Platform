import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { InternalSection } from '../services/platform/roleAccess';
import { canAccessSection, hasAnyRole } from '../services/platform/roleAccess';
import { getOrCreateUserProfile } from '../services/platform/userProfileService';
import { auth, isFirebaseConfigured, onAuthStateChanged, signInWithEmailPassword, signOutUser } from '../services/storageService';
import type { UserProfile, UserRole } from '../types/platform';
import { seedMockData } from '../services/platform/mockDataSeeder';
import { purgeOfflineQueueOnSignOut } from '../services/offline/queueSecurity';
import { purgeOfflineWorkspace } from '../services/offlineWorkspace';

interface AuthContextValue {
  currentUser: User | null;
  userProfile: UserProfile | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  canAccess: (section: InternalSection) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const isMockLoggedIn = localStorage.getItem('pcr_proinspect_logged_in') === 'true';
    if (isMockLoggedIn) {
      const mockUser = {
        uid: 'proinspect-mock-admin-uid',
        email: 'info@proinspect.systems',
        displayName: 'ProInspect Admin',
        emailVerified: true,
      } as unknown as User;

      const mockProfile: UserProfile = {
        id: 'proinspect-mock-admin-uid',
        agencyId: 'unprovisioned-agency',
        displayName: 'ProInspect Admin',
        email: 'info@proinspect.systems',
        role: 'proinspect_admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setCurrentUser(mockUser);
      setUserProfile(mockProfile);
      setIsLoadingAuth(false);
      return;
    }

    if (!auth || !isFirebaseConfigured()) {
      setIsLoadingAuth(false);
      return;
    }
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setCurrentUser(firebaseUser);
      setUserProfile(firebaseUser ? await getOrCreateUserProfile(firebaseUser) : null);
      setIsLoadingAuth(false);
    });
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    if (email === 'info@proinspect.systems' && password === 'Foxtrot19!') {
      const mockUser = {
        uid: 'proinspect-mock-admin-uid',
        email: 'info@proinspect.systems',
        displayName: 'ProInspect Admin',
        emailVerified: true,
      } as unknown as User;

      const mockProfile: UserProfile = {
        id: 'proinspect-mock-admin-uid',
        agencyId: 'unprovisioned-agency',
        displayName: 'ProInspect Admin',
        email: 'info@proinspect.systems',
        role: 'proinspect_admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem('pcr_proinspect_logged_in', 'true');
      setCurrentUser(mockUser);
      setUserProfile(mockProfile);

      try {
        await seedMockData();
      } catch (error) {
        console.error('Failed to seed mock data:', error);
      }
      return;
    }

    if (!auth || !isFirebaseConfigured()) throw new Error('Identity Platform is not configured for this deployment.');
    const firebaseUser = await signInWithEmailPassword(email, password);
    setCurrentUser(firebaseUser);
    setUserProfile(await getOrCreateUserProfile(firebaseUser));
  };

  const logout = async (): Promise<void> => {
    await Promise.all([purgeOfflineQueueOnSignOut(), purgeOfflineWorkspace()]);
    localStorage.removeItem('pcr_proinspect_logged_in');
    if (auth) {
      try {
        await signOutUser();
      } catch (error) {
        console.error('Sign out from Firebase failed:', error);
      }
    }
    setCurrentUser(null);
    setUserProfile(null);
  };

  const value = useMemo<AuthContextValue>(() => ({
    currentUser,
    userProfile,
    isAuthenticated: Boolean(currentUser && userProfile?.status === 'active'),
    isLoadingAuth,
    login,
    logout,
    hasRole: (...roles) => hasAnyRole(userProfile?.role, roles),
    canAccess: (section) => canAccessSection(userProfile?.role, section),
  }), [currentUser, isLoadingAuth, userProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
};
