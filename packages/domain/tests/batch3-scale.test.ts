import { describe, expect, it } from 'vitest';
import {
  approvePortfolioAudit,
  assertNoCapacityOverlap,
  assertPublishedBrandingImmutable,
  buildEvidencePackManifest,
  buildPortfolioAuditRun,
  calculateServiceDueAt,
  classifyUsage,
  cloneBranding,
  findServiceArea,
  publishBranding,
  reserveCapacity,
  resolveEntitlement,
  retireBranding,
  type AgencyBrandingVersion,
  type CapacitySlotRecord,
  type EvidenceIndexRecord,
  type EvidencePackRecord,
} from '../src/index.js';

describe('Batch 3 scale policy engine', () => {
  it('enforces entitlements and limits', () => {
    const entitlement = resolveEntitlement([{ id: 'ent-1', agencyId: 'agency-a', feature: 'scale.service_operations', enabled: true, limit: 5, effectiveFrom: '2026-01-01T00:00:00.000Z' }], 'scale.service_operations', new Date('2026-07-01T00:00:00.000Z'), 4);
    expect(entitlement.id).toBe('ent-1');
    expect(() => resolveEntitlement([entitlement], 'scale.service_operations', new Date('2026-07-01T00:00:00.000Z'), 5)).toThrowError(/configured limit/u);
  });

  it('calculates service due dates and reserves capacity safely', () => {
    expect(calculateServiceDueAt('2026-07-20T00:00:00.000Z', 'field_attendance', 'urgent', [{ id: 'sla-1', serviceType: 'field_attendance', defaultHours: 24, priorityHours: { urgent: 4 } }])).toBe('2026-07-20T04:00:00.000Z');
    const slot: CapacitySlotRecord = { id: 'slot-1', agencyId: 'agency-a', serviceAreaId: 'area-1', fieldUserId: 'user-1', startAt: '2026-07-20T01:00:00.000Z', endAt: '2026-07-20T04:00:00.000Z', capacityUnits: 3, reservedUnits: 1 };
    expect(reserveCapacity(slot, 2, 1).reservedUnits).toBe(3);
    expect(() => reserveCapacity(slot, 3, 1)).toThrowError(/cannot accommodate/u);
    expect(() => assertNoCapacityOverlap({ ...slot, id: 'slot-2', startAt: '2026-07-20T03:00:00.000Z' }, [slot])).toThrowError(/overlapping/u);
  });

  it('matches active service areas and classifies usage', () => {
    const area = findServiceArea([{ id: 'area-1', agencyId: 'agency-a', name: 'Perth metro', postcodes: ['6000'], travelPolicyId: 'travel-1', operatingHours: { monday: '08:00-17:00' }, active: true }], '6000', new Date('2026-07-20T02:00:00.000Z'));
    expect(area.id).toBe('area-1');
    expect(classifyUsage({ id: 'usage-1', agencyId: 'agency-a', propertyId: 'property-1', serviceOrderId: 'order-1', usageType: 'field_attendance', units: 2, occurredAt: '2026-07-20T00:00:00.000Z' }, 4, { usageType: 'field_attendance', includedUnits: 5, fairUseUnits: 10 }).classification).toBe('fair_use_review');
  });
});

describe('Batch 3 portfolio audit engine', () => {
  it('builds deterministic findings and requires an approver', () => {
    const run = buildPortfolioAuditRun('audit-1', 'agency-a', ['property-1'], [{ propertyId: 'property-1', hasEntryBaseline: false, unresolvedHighMaintenance: 1, evidenceReadiness: 0.5, accessFailureCount: 2, hasFinalArchive: false, keyAccessComplete: false }], 'admin-1', new Date('2026-07-20T00:00:00.000Z'));
    expect(run.status).toBe('review_required');
    expect(run.findings.map((finding) => finding.category)).toEqual(expect.arrayContaining(['missing_entry', 'maintenance', 'evidence_readiness', 'access_failure', 'missing_archive', 'key_access']));
    expect(() => approvePortfolioAudit(run, '')).toThrowError(/approver/u);
    expect(approvePortfolioAudit(run, 'reviewer-1')).toMatchObject({ status: 'approved', approvedBy: 'reviewer-1', version: 2 });
  });
});

describe('Batch 3 evidence pack foundation', () => {
  it('builds a stable privacy-reviewed manifest', () => {
    const pack: EvidencePackRecord = { id: 'pack-1', agencyId: 'agency-a', propertyId: 'property-1', reportVersionIds: ['version-1'], evidenceIds: ['evidence-1'], requestedBy: 'admin-1', purpose: 'Owner dispute review', authorisedRequesterId: 'owner-1', privacyReviewedBy: 'reviewer-1', status: 'approved', expiresAt: '2026-08-01T00:00:00.000Z' };
    const evidence: EvidenceIndexRecord[] = [{ id: 'evidence-1', agencyId: 'agency-a', propertyId: 'property-1', reportId: 'report-1', reportVersionId: 'version-1', componentIds: ['component-1'], evidenceType: 'photo', purposeTags: ['defect'], availableDerivatives: ['display'], privacyClassification: 'standard', retentionClass: 'tenancy-evidence', status: 'available' }];
    const first = buildEvidencePackManifest(pack, evidence, '2026-07-20T00:00:00.000Z');
    const second = buildEvidencePackManifest(pack, evidence, '2026-07-20T00:00:00.000Z');
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.itemCount).toBe(1);
  });
});

describe('Batch 3 branding lifecycle', () => {
  const draft: AgencyBrandingVersion = { id: 'brand-1', agencyId: 'agency-a', version: 1, primaryColour: '#111111', secondaryColour: '#f2b705', contactDetails: { phone: '08 1234 5678' }, emailSenderName: 'Agency Team', status: 'draft', contentHash: '' };

  it('publishes, protects, retires and clones branding versions', () => {
    const published = publishBranding(draft);
    expect(published.status).toBe('published');
    expect(published.contentHash).toHaveLength(64);
    expect(() => assertPublishedBrandingImmutable(published, { ...published, primaryColour: '#222222' })).toThrowError(/cannot be changed/u);
    expect(retireBranding(published).status).toBe('retired');
    expect(cloneBranding(published, 2)).toMatchObject({ version: 2, status: 'draft', contentHash: '' });
  });
});
