import { describe, expect, it } from 'vitest';
import { hasDirtyScopes, markCleanScope, markDirtyScope } from '../services/dirtyState';

describe('record-scoped dirty state', () => {
  it('keeps two edited records independent and cleans only the saved record', () => {
    const property = { id: 'property:one', entityType: 'property' as const, entityId: 'one', dirty: true };
    const report = { id: 'report:two', entityType: 'report' as const, entityId: 'two', dirty: true };
    const both = markDirtyScope(markDirtyScope({}, property), report);

    const afterPropertySave = markCleanScope(both, property.id);
    expect(afterPropertySave[property.id]).toBeUndefined();
    expect(afterPropertySave[report.id]?.dirty).toBe(true);
    expect(hasDirtyScopes(afterPropertySave)).toBe(true);
  });

  it('does not clean a form when an unrelated operation completes', () => {
    const scopes = markDirtyScope({}, { id: 'settings:drive', entityType: 'settings', entityId: 'drive', dirty: true });
    expect(markCleanScope(scopes, 'report:background')).toBe(scopes);
    expect(hasDirtyScopes(scopes)).toBe(true);
  });
});
