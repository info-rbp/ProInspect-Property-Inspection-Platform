import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, onAuthStateChanged as onFirebaseAuthStateChanged, signInWithEmailAndPassword, signOut, type Auth, type User } from 'firebase/auth';
import { getResolvedFirebaseConfig, isFirebaseConfigured as isFirebaseConfigResolved } from './configService';

export let firebaseApp: FirebaseApp | undefined;
export let auth: Auth | undefined;
try {
  const config = getResolvedFirebaseConfig();
  if (config) { firebaseApp = initializeApp(config); auth = getAuth(firebaseApp); }
} catch (error) { console.error('Firebase identity initialization failed', error); }

export const isFirebaseConfigured = (): boolean => {
  if (typeof window !== 'undefined' && window.localStorage.getItem('pcr_proinspect_logged_in') === 'true') return false;
  return isFirebaseConfigResolved();
};
export const onAuthStateChanged = onFirebaseAuthStateChanged;
export const signInWithEmailPassword = async (email: string, password: string): Promise<User> => {
  if (!auth) throw new Error('Identity Platform is not configured for this deployment.');
  return (await signInWithEmailAndPassword(auth, email, password)).user;
};
export const signOutUser = async (): Promise<void> => { if (auth) await signOut(auth); };
