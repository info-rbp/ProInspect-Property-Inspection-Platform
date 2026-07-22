import { openDB } from 'idb';
import { createShellOperationId, emitShellOperation } from '../shellEvents';

const LOCAL_PLATFORM_DB = 'proinspect-platform-db';

export type PlatformStoreName =
  | 'clients'
  | 'properties'
  | 'inspectionJobs'
  | 'reportIndexes'
  | 'users'
  | 'auditEvents'
  | 'agencies'
  | 'tenancies';

const STORE_NAMES: PlatformStoreName[] = [
  'clients',
  'properties',
  'inspectionJobs',
  'reportIndexes',
  'users',
  'auditEvents',
  'agencies',
  'tenancies',
];

export const initPlatformDB = async () => {
  return openDB(LOCAL_PLATFORM_DB, 4, {
    upgrade(database) {
      STORE_NAMES.forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' });
        }
      });
    },
  });
};

export const localPut = async <T extends { id: string }>(storeName: PlatformStoreName, record: T): Promise<T> => {
  const operationId = createShellOperationId(`local-${storeName}`);
  emitShellOperation({ id: operationId, kind: 'save', status: 'started', title: `Saving ${storeName}`, persistence: 'local', source: storeName });
  try {
    const database = await initPlatformDB();
    await database.put(storeName, record);
    emitShellOperation({ id: operationId, kind: 'save', status: 'succeeded', title: 'Saved on this device', persistence: 'local', source: storeName, clearDirty: true });
    return record;
  } catch (error) {
    emitShellOperation({ id: operationId, kind: 'save', status: 'failed', title: 'Local save failed', message: error instanceof Error ? error.message : 'The record could not be saved on this device.', persistence: 'local', source: storeName });
    throw error;
  }
};

export const localGet = async <T>(storeName: PlatformStoreName, id: string): Promise<T | undefined> => {
  const database = await initPlatformDB();
  return database.get(storeName, id);
};

export const localList = async <T>(storeName: PlatformStoreName): Promise<T[]> => {
  const database = await initPlatformDB();
  return database.getAll(storeName);
};
