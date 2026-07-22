import { describe, expect, it, vi } from 'vitest';
import { runShellOperation } from '../services/runShellOperation';
import { subscribeToShellOperations, type ShellOperationDetail } from '../services/shellEvents';

describe('runShellOperation', () => {
  it('publishes started then succeeded with the same id and dirty scope', async () => {
    const events: ShellOperationDetail[] = [];
    const unsubscribe = subscribeToShellOperations((event) => events.push(event));
    await expect(runShellOperation({ kind: 'save', title: 'Save property', source: 'test', dirtyScopeId: 'property:1', entityType: 'property', entityId: '1' }, async () => 'saved')).resolves.toBe('saved');
    unsubscribe();

    expect(events.map((event) => event.status)).toEqual(['started', 'succeeded']);
    expect(events[1]).toMatchObject({ id: events[0].id, dirtyScopeId: 'property:1', clearDirty: true });
  });

  it('publishes started then failed and preserves error diagnostics', async () => {
    const events: ShellOperationDetail[] = [];
    const unsubscribe = subscribeToShellOperations((event) => events.push(event));
    const error = Object.assign(new Error('Conflict'), { code: 'VERSION_CONFLICT', status: 409, correlationId: 'corr-1' });
    await expect(runShellOperation({ kind: 'sync', title: 'Sync report', source: 'test', dirtyScopeId: 'report:1' }, async () => { throw error; })).rejects.toThrow('Conflict');
    unsubscribe();

    expect(events.map((event) => event.status)).toEqual(['started', 'failed']);
    expect(events[1]).toMatchObject({ id: events[0].id, errorCode: 'VERSION_CONFLICT', httpStatus: 409, correlationId: 'corr-1', retryable: false });
    expect(events[1].clearDirty).toBeUndefined();
  });

  it('always terminates a started operation when the action rejects', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToShellOperations(listener);
    await runShellOperation({ kind: 'upload', title: 'Upload', source: 'test' }, async () => Promise.reject(new Error('network'))).catch(() => undefined);
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
