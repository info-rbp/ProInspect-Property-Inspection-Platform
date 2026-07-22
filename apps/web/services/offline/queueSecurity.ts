import type { QueuedMutation } from './offlineQueue';
import { purgeExpiredMutations, purgeQueuedMutations } from './offlineQueue';

const UNSAFE_PATH = /\/(?:analysis|ai|pdf|uploads?|roles?|permissions?|transitions)(?:\/|$)/iu;

export const canQueueMutation = (method: QueuedMutation['method'], path: string): boolean => (
  method !== 'DELETE' && !UNSAFE_PATH.test(path)
);

export const assertReplayIdentity = (
  mutation: QueuedMutation,
  actorId: string,
  agencyId: string,
): void => {
  if (mutation.actorId !== actorId || mutation.agencyId !== agencyId) {
    throw new Error('Queued changes cannot be replayed under a different user or agency.');
  }
  if (Date.parse(mutation.expiresAt) <= Date.now()) throw new Error('This queued change has expired.');
};

export const purgeOfflineQueueOnSignOut = async (): Promise<void> => {
  await purgeQueuedMutations();
};

export const enforceQueueRetention = async (): Promise<number> => purgeExpiredMutations();
