import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { InternalSection } from '../services/platform/roleAccess';
import { canAccessSection, hasAnyRole } from '../services/platform/roleAccess';
import { getOrCreateUserProfile } from '../services/platform/userProfileService';
import { auth, isFirebaseConfigured, onAuthStateChanged, signInWithEmailPassword, signOutUser } from '../services/firebaseClient';
import type { UserProfile, UserRole } from '../types/platform';
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

interface MockAccount {
  uid: string;
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

// Hardcoded mock accounts that bypass Firebase Authentication entirely.
// Add new entries here to grant additional hardcoded logins.
const MOCK_ACCOUNTS: MockAccount[] = [
  {
    uid: 'proinspect-mock-admin-uid',
    email: 'info@proinspect.systems',
    password: 'Foxtrot19!',
    displayName: 'ProInspect Admin',
    role: 'proinspect_admin',
  },
  {
    uid: 'rbp-mock-admin-uid',
    email: 'info@remotebusinesspartner.com.au',
    password: 'Foxtrot19!',
    displayName: 'Remote Business Partner Admin',
    role: 'proinspect_admin',
  },
];

const MOCK_LOGIN_STORAGE_KEY = 'pcr_proinspect_logged_in';
const MOCK_LOGIN_EMAIL_STORAGE_KEY = 'pcr_proinspect_logged_in_email';

const findMockAccountByEmail = (email: string): MockAccount | undefined =>
  MOCK_ACCOUNTS.find((account) => account.email.toLowerCase() === email.toLowerCase());

const buildMockIdentity = (account: MockAccount): { mockUser: User; mockProfile: UserProfile } => {
  const mockUser = {
    uid: account.uid,
    email: account.email,
    displayName: account.displayName,
    emailVerified: true,
  } as unknown as User;

  const mockProfile: UserProfile = {
    id: account.uid,
    agencyId: 'unprovisioned-agency',
    displayName: account.displayName,
    email: account.email,
    role: account.role,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { mockUser, mockProfile };
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const isMockLoggedIn = localStorage.getItem(MOCK_LOGIN_STORAGE_KEY) === 'true';
    if (isMockLoggedIn) {
      const storedEmail = localStorage.getItem(MOCK_LOGIN_EMAIL_STORAGE_KEY);
      const account = (storedEmail && findMockAccountByEmail(storedEmail)) ?? MOCK_ACCOUNTS[0];
      const { mockUser, mockProfile } = buildMockIdentity(account);

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
    const mockAccount = findMockAccountByEmail(email);
    if (mockAccount && mockAccount.password === password) {
      const { mockUser, mockProfile } = buildMockIdentity(mockAccount);

      localStorage.setItem(MOCK_LOGIN_STORAGE_KEY, 'true');
      localStorage.setItem(MOCK_LOGIN_EMAIL_STORAGE_KEY, mockAccount.email);
      setCurrentUser(mockUser);
      setUserProfile(mockProfile);

      try {
        const { seedMockData } = await import('../services/platform/mockDataSeeder');
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
    localStorage.removeItem(MOCK_LOGIN_STORAGE_KEY);
    localStorage.removeItem(MOCK_LOGIN_EMAIL_STORAGE_KEY);
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
