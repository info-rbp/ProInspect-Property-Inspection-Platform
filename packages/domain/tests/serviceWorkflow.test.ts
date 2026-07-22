import { describe, expect, it } from 'vitest';
import { transitionComparison, transitionDelivery, transitionMaintenance, transitionServiceOrder } from '../src/serviceWorkflow.js';

describe('commercial and service workflows', () => {
  it('requires evidence before maintenance completion', () => {
    const item = { id: 'm1', agencyId: 'a1', propertyId: 'p1', sourceReportId: 'r1', sourceReportVersionId: 'v1', sourceAreaId: 'area', sourceComponentId: 'door', sourceEvidenceIds: [], observation: 'Latch loose.', category: 'security' as const, operationalPriority: 'high' as const, safetyIndicator: false, recommendedAction: 'Inspect latch.', status: 'in_progress' as const, version: 3 };
    expect(() => transitionMaintenance(item, 'completed')).toThrow('require evidence');
    expect(transitionMaintenance(item, 'completed', ['completion-1']).status).toBe('completed');
  });

  it('does not approve comparisons with unmatched records', () => {
    const run = { id: 'c1', agencyId: 'a1', propertyId: 'p1', sourceReportId: 'r1', sourceVersionId: 'v1', targetReportId: 'r2', targetVersionId: 'v2', mappingVersion: '1', status: 'review_in_progress' as const, unmatchedSourceIds: ['door'], unmatchedTargetIds: [] };
    expect(() => transitionComparison(run, 'approved')).toThrow('unmatched');
  });

  it('tracks secure delivery access timestamps', () => {
    const delivery = { id: 'd1', agencyId: 'a1', reportId: 'r1', reportVersionId: 'v1', recipientType: 'tenant' as const, assets: [], tokenHash: 'hash', expiresAt: '2027-01-01T00:00:00.000Z', status: 'sent' as const };
    expect(transitionDelivery(delivery, 'opened', '2026-08-01T00:00:00.000Z').openedAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('enforces the managed-service lifecycle', () => {
    const order = { id: 's1', agencyId: 'a1', serviceType: 'report_production' as const, relatedEntityType: 'report', relatedEntityId: 'r1', requestedBy: 'u1', priority: 'normal' as const, status: 'requested' as const, version: 1, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' };
    expect(transitionServiceOrder(order, 'triaged', 'ops-1').status).toBe('triaged');
    expect(() => transitionServiceOrder(order, 'completed', 'ops-1')).toThrow('cannot move');
  });
});
