import { describe, expect, it } from 'vitest';
import { assertEntitled, compareComponents, evaluatePortfolioProperty, expandCommentaryPhrase } from '../src/commercialRules.js';

describe('commercial rules', () => {
  it('expands only complete active phrases', () => {
    expect(expandCommentaryPhrase({ id: 'p', agencyId: 'a', shortcut: 'leak', text: '{{room}} has {{issue}}.', inspectionTypes: ['routine'], tags: [], status: 'active', version: 1 }, { room: 'Kitchen', issue: 'a leak' })).toBe('Kitchen has a leak.');
    expect(() => expandCommentaryPhrase({ id: 'p', agencyId: 'a', shortcut: 'x', text: '{{value}}', inspectionTypes: ['entry'], tags: [], status: 'active', version: 1 }, {})).toThrow(/Missing phrase/);
  });

  it('enforces time-bound entitlements and quotas', () => {
    const entries = [{ id: 'e', agencyId: 'a', feature: 'commercial.evidence_vault', enabled: true, limit: 2, effectiveFrom: '2025-01-01T00:00:00Z' }];
    expect(assertEntitled(entries, 'commercial.evidence_vault', new Date('2026-01-01'), 1).id).toBe('e');
    expect(() => assertEntitled(entries, 'commercial.evidence_vault', new Date('2026-01-01'), 2)).toThrow(/limit/);
  });

  it('pairs template components deterministically and leaves changed values for review', () => {
    const result = compareComponents([{ id: 's', templateComponentId: 'door', name: 'Door', condition: 'good' }], [{ id: 't', templateComponentId: 'door', name: 'Door', condition: 'damaged' }], 'run');
    expect(result[0]).toMatchObject({ sourceComponentId: 's', targetComponentId: 't', classification: 'review_required', reviewStatus: 'pending' });
  });

  it('emits evidence-based portfolio exceptions', () => {
    const findings = evaluatePortfolioProperty({ propertyId: 'p', hasEntryBaseline: false, nextInspectionAt: '2025-01-01', unresolvedHighMaintenance: 1, evidenceReadiness: 0.5, accessFailureCount: 2, hasFinalArchive: false, keyAccessComplete: false }, new Date('2026-01-01'));
    expect(findings.map((finding) => finding.category)).toEqual(['missing_entry', 'overdue_inspection', 'maintenance', 'evidence_readiness', 'access_failure', 'missing_archive', 'key_access']);
  });
});
