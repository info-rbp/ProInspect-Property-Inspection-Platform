import { describe, expect, it } from 'vitest';
import { materialisePublishedTemplate } from '../src/materialise.js';
import { waEntryResidentialV1, waExitResidentialV1 } from '../src/presets/wa/index.js';

const input = {
  agencyId: 'agency-1', reportId: 'report-1', inspectionJobId: 'job-1', propertyId: 'property-1',
  propertyAddress: '1 Test Street', assignedAt: '2026-08-01T00:00:00.000Z', assignedBy: 'ops-1',
};

describe('published template materialisation', () => {
  it('creates a domain-native draft with an immutable assignment', () => {
    const aggregate = materialisePublishedTemplate(waEntryResidentialV1, input);
    expect(aggregate.report.templateAssignment?.immutable).toBe(true);
    expect(aggregate.areas.length).toBeGreaterThan(0);
    expect(aggregate.areas[0]?.components[0]?.workingStatus).toBe('untested');
  });

  it('requires an immutable Entry baseline for Exit', () => {
    expect(() => materialisePublishedTemplate(waExitResidentialV1, input)).toThrow('baseline');
  });
});
