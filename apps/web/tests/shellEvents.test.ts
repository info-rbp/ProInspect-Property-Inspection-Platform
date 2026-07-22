import { describe, expect, it, vi } from 'vitest';
import { classifyOperationalFailure, createShellOperationId, emitShellOperation, subscribeToShellOperations } from '../services/shellEvents';

describe('shell operation events', () => {
  it('publishes operation details with a timestamp', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToShellOperations(listener);

    emitShellOperation({
      id: 'save-1',
      kind: 'save',
      status: 'succeeded',
      title: 'Saved',
      persistence: 'cloud',
      clearDirty: true,
    });

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      id: 'save-1',
      kind: 'save',
      status: 'succeeded',
      persistence: 'cloud',
      clearDirty: true,
      occurredAt: expect.any(String),
    }));
    unsubscribe();
  });

  it('creates namespaced operation identifiers', () => {
    expect(createShellOperationId('upload')).toMatch(/^upload:/u);
  });

  it.each([
    ['PDF render failed', 'pdf'],
    ['Image upload failed', 'upload'],
    ['Gemini quota exceeded', 'analysis'],
    ['Cloud synchronisation failed', 'sync'],
    ['Record could not be saved', 'save'],
  ] as const)('classifies %s as %s', (message, expected) => {
    expect(classifyOperationalFailure(message)).toBe(expected);
  });
});
