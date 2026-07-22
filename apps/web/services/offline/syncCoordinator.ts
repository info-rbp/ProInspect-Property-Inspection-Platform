import { apiRequest } from '../apiClient';
import { conflictFromError, publishConflict } from './conflictService';
import { listQueuedMutations, removeQueuedMutation, updateQueuedMutation, type QueuedMutation } from './offlineQueue';
import { assertReplayIdentity, enforceQueueRetention } from './queueSecurity';

const backoffMilliseconds = (attempts: number): number => Math.min(60_000, 1_000 * (2 ** Math.min(attempts, 6)));

export const synchroniseQueuedMutations = async (actorId: string, agencyId: string): Promise<void> => {
  if (!navigator.onLine) return;
  await enforceQueueRetention();
  const now = Date.now();
  for (const mutation of await listQueuedMutations(actorId, agencyId)) {
    if (mutation.status === 'conflict' || (mutation.nextAttemptAt && Date.parse(mutation.nextAttemptAt) > now)) continue;
    try {
      assertReplayIdentity(mutation, actorId, agencyId);
      await updateQueuedMutation(mutation.id, { status: 'processing' });
      await apiRequest(agencyId, mutation.path, {
        method: mutation.method,
        body: mutation.body,
        idempotencyKey: mutation.idempotencyKey,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        baseVersion: mutation.baseVersion,
        queueWhenOffline: false,
        announceSuccess: true,
      });
      await removeQueuedMutation(mutation.id);
    } catch (error) {
      const conflict = conflictFromError(mutation, error);
      if (conflict) {
        await updateQueuedMutation(mutation.id, { status: 'conflict', lastError: 'A newer server version exists.' });
        publishConflict(conflict);
        continue;
      }
      const attempts = mutation.attempts + 1;
      await updateQueuedMutation(mutation.id, {
        attempts,
        status: 'failed',
        lastError: error instanceof Error ? error.message : 'Synchronisation failed.',
        nextAttemptAt: new Date(Date.now() + backoffMilliseconds(attempts)).toISOString(),
      });
    }
  }
};

export const installSyncCoordinator = (actorId: string, agencyId: string): (() => void) => {
  let active = false;
  const sync = () => {
    if (active) return;
    active = true;
    void synchroniseQueuedMutations(actorId, agencyId).finally(() => { active = false; });
  };
  window.addEventListener('online', sync);
  sync();
  return () => window.removeEventListener('online', sync);
};

export type { QueuedMutation };
