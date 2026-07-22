import type { QueuedMutation } from './offlineQueue';

export type ConflictResolution = 'keep-server' | 'overwrite-local' | 'manual-merge' | 'save-as-copy';

export interface MutationConflict {
  queueId: string;
  entityType: string;
  entityId?: string;
  serverVersion: number;
  serverRecord: unknown;
  submittedRecord: unknown;
}

export const conflictFromError = (mutation: QueuedMutation, error: unknown): MutationConflict | undefined => {
  const candidate = error as { status?: number; details?: Record<string, unknown> };
  if (candidate?.status !== 409) return undefined;
  const details = candidate.details ?? {};
  return {
    queueId: mutation.id,
    entityType: mutation.entityType,
    entityId: mutation.entityId,
    serverVersion: typeof details.serverVersion === 'number' ? details.serverVersion : mutation.baseVersion ?? 0,
    serverRecord: details.serverRecord,
    submittedRecord: details.submittedRecord ?? mutation.body,
  };
};

export const publishConflict = (conflict: MutationConflict): void => {
  window.dispatchEvent(new CustomEvent<MutationConflict>('proinspect:sync-conflict', { detail: conflict }));
};

export const subscribeToConflicts = (listener: (conflict: MutationConflict) => void): (() => void) => {
  const handler = (event: Event) => listener((event as CustomEvent<MutationConflict>).detail);
  window.addEventListener('proinspect:sync-conflict', handler);
  return () => window.removeEventListener('proinspect:sync-conflict', handler);
};
