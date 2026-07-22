import { describe, expect, it } from 'vitest';
import type { ReportData } from '../types';
import { adaptLegacyReport } from '../features/report-workspace/model/legacyReportAdapter';

const legacy = (photoCount = 1): ReportData => ({
  id: 'report-1', agencyId: 'agency-a', propertyAddress: '1 Test Street', agentName: 'Agent', agentCompany: 'Agency',
  clientName: 'Owner', inspectionDate: '2026-07-22', tenantName: 'Tenant', reportType: 'Property Condition Report',
  rooms: [{
    id: 'entry', name: 'Entry', status: 'complete', overallComment: '',
    photos: Array.from({ length: photoCount }, (_, index) => ({ id: `photo-${index}`, file: new File([], `photo-${index}.jpg`), previewUrl: '', objectPath: `inspection-originals/photo-${index}.jpg` })),
    items: [{ id: 'door', name: 'Door', isClean: true, isUndamaged: true, isWorking: true, comment: 'Legacy record says working.' }],
  }],
});

describe('legacy report adapter', () => {
  it('never converts a boolean into an operational or tested claim', () => {
    const { aggregate } = adaptLegacyReport(legacy(), 'agency-a');
    const component = aggregate.areas[0]!.components[0]!;
    expect(component.workingStatus).toBe('untested');
    expect(component.testStatus).toBe('untested');
    expect(component.testingMethod).toBe('not_tested');
    expect(component.reviewStatus).toBe('draft');
  });

  it('does not fan ambiguous room evidence out to every component', () => {
    const migrated = adaptLegacyReport(legacy(2), 'agency-a');
    expect(migrated.aggregate.areas[0]!.components[0]!.photoReferences).toEqual([]);
    expect(migrated.warnings.join(' ')).toContain('ambiguous');
  });
});
