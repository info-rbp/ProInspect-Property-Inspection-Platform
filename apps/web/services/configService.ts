import firebaseAppletConfig from '../../../firebase-applet-config.json';
import { runShellOperation } from './runShellOperation';

export interface RuntimeConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  enableCloudSync: boolean;
}

export interface FirebaseRuntimeConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const CONFIG_KEY = 'rbp_runtime_config';

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  enableCloudSync: false,
};

const sanitizeString = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const sanitizeRuntimeConfig = (value: Partial<RuntimeConfig> | null | undefined): RuntimeConfig => ({
  apiKey: sanitizeString(value?.apiKey),
  authDomain: sanitizeString(value?.authDomain),
  projectId: sanitizeString(value?.projectId),
  storageBucket: sanitizeString(value?.storageBucket),
  messagingSenderId: sanitizeString(value?.messagingSenderId),
  appId: sanitizeString(value?.appId),
  enableCloudSync: Boolean(value?.enableCloudSync),
});

export const getRuntimeConfig = (): RuntimeConfig => {
  if (typeof window === 'undefined') return DEFAULT_RUNTIME_CONFIG;
  try {
    const stored = window.localStorage.getItem(CONFIG_KEY);
    if (!stored) return DEFAULT_RUNTIME_CONFIG;
    return sanitizeRuntimeConfig(JSON.parse(stored));
  } catch {
    return DEFAULT_RUNTIME_CONFIG;
  }
};

export const saveRuntimeConfig = (config: RuntimeConfig): Promise<RuntimeConfig> => {
  const sanitized = sanitizeRuntimeConfig(config);
  return runShellOperation({
    kind: 'save', title: 'Runtime configuration saved', persistence: 'local', source: CONFIG_KEY,
    dirtyScopeId: 'settings:platform', entityType: 'settings', entityId: 'platform', action: 'update', announceSuccess: true,
  }, async () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(CONFIG_KEY, JSON.stringify(sanitized));
    return sanitized;
  });
};

export const clearRuntimeConfig = (): void => {
  if (typeof window !== 'undefined') window.localStorage.removeItem(CONFIG_KEY);
};

const hasCompleteFirebaseConfig = (config: FirebaseRuntimeConfig): boolean => Boolean(
  config.apiKey && config.authDomain && config.projectId && config.storageBucket && config.messagingSenderId && config.appId
);

export const isRuntimeFirebaseFallbackAllowed = (): boolean => Boolean(import.meta.env.DEV);

export const getEnvFirebaseConfig = (): FirebaseRuntimeConfig => ({
  apiKey: sanitizeString(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: sanitizeString(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: sanitizeString(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: sanitizeString(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: sanitizeString(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: sanitizeString(import.meta.env.VITE_FIREBASE_APP_ID),
});

export const getRuntimeFirebaseConfig = (): FirebaseRuntimeConfig => {
  const config = getRuntimeConfig();
  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  };
};

export const getResolvedFirebaseConfig = (): FirebaseRuntimeConfig | undefined => {
  const envConfig = getEnvFirebaseConfig();
  if (hasCompleteFirebaseConfig(envConfig)) return envConfig;

  const runtimeConfig = getRuntimeConfig();
  const runtimeFirebaseConfig = getRuntimeFirebaseConfig();
  if (isRuntimeFirebaseFallbackAllowed() && runtimeConfig.enableCloudSync && hasCompleteFirebaseConfig(runtimeFirebaseConfig)) return runtimeFirebaseConfig;

  if (firebaseAppletConfig && firebaseAppletConfig.apiKey && firebaseAppletConfig.projectId) {
    return {
      apiKey: firebaseAppletConfig.apiKey,
      authDomain: firebaseAppletConfig.authDomain || '',
      projectId: firebaseAppletConfig.projectId,
      storageBucket: firebaseAppletConfig.storageBucket || '',
      messagingSenderId: firebaseAppletConfig.messagingSenderId || '',
      appId: firebaseAppletConfig.appId || ''
    };
  }
  return undefined;
};

export const getFirebaseConfig = (): FirebaseRuntimeConfig => getResolvedFirebaseConfig() || getRuntimeFirebaseConfig();
export const isCloudSyncEnabled = (): boolean => Boolean(getResolvedFirebaseConfig());
export const isFirebaseConfigured = (): boolean => Boolean(getResolvedFirebaseConfig());
