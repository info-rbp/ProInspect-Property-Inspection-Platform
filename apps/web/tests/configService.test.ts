import {
  clearRuntimeConfig,
  getRuntimeConfig,
  isFirebaseConfigured,
  isCloudSyncEnabled,
  saveRuntimeConfig,
} from '../services/configService';

describe('configService', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRuntimeConfig();
  });

  it('returns defaults when no config exists', () => {
    expect(getRuntimeConfig()).toEqual({
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
      enableCloudSync: false,
    });
  });

  it('persists sanitized config values', () => {
    saveRuntimeConfig({
      apiKey: ' firebase-key ',
      authDomain: ' project.firebaseapp.com ',
      projectId: ' my-project ',
      storageBucket: ' bucket ',
      messagingSenderId: ' sender ',
      appId: ' app-id ',
      enableCloudSync: true,
    });

    expect(getRuntimeConfig().apiKey).toBe('firebase-key');
    expect(isCloudSyncEnabled()).toBe(true);
    expect(isFirebaseConfigured()).toBe(true);
  });
});
