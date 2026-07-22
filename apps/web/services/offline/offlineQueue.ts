import { openDB, type DBSchema } from 'idb';

export type QueuedMutationStatus = 'queued' | 'processing' | 'failed' | 'conflict';

export interface QueuedMutation {
  id: string;
  agencyId: string;
  actorId: string;
  entityType: string;
  entityId?: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
  idempotencyKey: string;
  baseVersion?: number;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  nextAttemptAt?: string;
  status: QueuedMutationStatus;
  lastError?: string;
}

interface OfflineQueueDatabase extends DBSchema {
  mutations: {
    key: string;
    value: QueuedMutation;
    indexes: {
      'by-actor': string;
      'by-agency': string;
      'by-status': QueuedMutationStatus;
    };
  };
}

const DATABASE_NAME = 'proinspect-offline-queue';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const database = () => openDB<OfflineQueueDatabase>(DATABASE_NAME, 1, {
  upgrade(db) {
    const store = db.createObjectStore('mutations', { keyPath: 'id' });
    store.createIndex('by-actor', 'actorId');
    store.createIndex('by-agency', 'agencyId');
    store.createIndex('by-status', 'status');
  },
});

export const enqueueMutation = async (
  mutation: Omit<QueuedMutation, 'createdAt' | 'expiresAt' | 'attempts' | 'status'>,
): Promise<QueuedMutation> => {
  const createdAt = new Date();
  const queued: QueuedMutation = {
    ...mutation,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + RETENTION_MS).toISOString(),
    attempts: 0,
    status: 'queued',
  };
  await (await database()).put('mutations', queued);
  window.dispatchEvent(new CustomEvent('proinspect:offline-queue-changed'));
  return queued;
};

export const listQueuedMutations = async (actorId?: string, agencyId?: string): Promise<QueuedMutation[]> => {
  const db = await database();
  const records = actorId ? await db.getAllFromIndex('mutations', 'by-actor', actorId) : await db.getAll('mutations');
  return records
    .filter((record) => !agencyId || record.agencyId === agencyId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
};

export const updateQueuedMutation = async (id: string, patch: Partial<QueuedMutation>): Promise<QueuedMutation | undefined> => {
  const db = await database();
  const existing = await db.get('mutations', id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch, id: existing.id };
  await db.put('mutations', updated);
  window.dispatchEvent(new CustomEvent('proinspect:offline-queue-changed'));
  return updated;
};

export const removeQueuedMutation = async (id: string): Promise<void> => {
  await (await database()).delete('mutations', id);
  window.dispatchEvent(new CustomEvent('proinspect:offline-queue-changed'));
};

export const purgeQueuedMutations = async (actorId?: string): Promise<void> => {
  const db = await database();
  if (!actorId) {
    await db.clear('mutations');
  } else {
    const transaction = db.transaction('mutations', 'readwrite');
    for await (const cursor of transaction.store.index('by-actor').iterate(actorId)) await cursor.delete();
    await transaction.done;
  }
  window.dispatchEvent(new CustomEvent('proinspect:offline-queue-changed'));
};

export const purgeExpiredMutations = async (now = new Date()): Promise<number> => {
  const db = await database();
  const transaction = db.transaction('mutations', 'readwrite');
  let removed = 0;
  for await (const cursor of transaction.store.iterate()) {
    if (Date.parse(cursor.value.expiresAt) <= now.getTime()) {
      await cursor.delete();
      removed += 1;
    }
  }
  await transaction.done;
  if (removed) window.dispatchEvent(new CustomEvent('proinspect:offline-queue-changed'));
  return removed;
};
