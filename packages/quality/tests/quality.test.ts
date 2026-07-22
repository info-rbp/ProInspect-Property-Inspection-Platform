import { describe, expect, it } from 'vitest';
import type { ReportAggregate } from '@pcr/domain';
import { runQualityCheck } from '../src/index.js';

const report = (): ReportAggregate => ({
  report: {
    id: 'report-1', agencyId: 'agency-a', inspectionType: 'entry', reportType: 'Property Condition Report',
    propertyAddress: '1 Test Street', inspectionDate: '2026-07-22', lifecycleStatus: 'draft',
    templateId: 'wa-entry', templateVersion: 1, templateHash: 'hash', workspaceRevision: 4, schemaVersion: 2,
  },
  areas: [{
    id: 'entry', name: 'Entry', sequence: 1,
    components: [{
      id: 'door', component: 'Door', visibility: 'visible', conditionCategory: 'intact', cleanlinessCategory: 'clean',
      workingStatus: 'untested', testStatus: 'untested', defects: [], maintenanceRequired: false,
      commentary: 'Visible and intact.', photoReferences: [], reviewStatus: 'draft', comparisonStatus: 'not_compared',
    }],
  }],
});

describe('Phase 1 quality engine', () => {
  it('returns a deterministic ready gate for a complete report', () => {
    const first = runQualityCheck({ aggregate: report(), stage: 'field_submission', now: '2026-07-22T00:00:00.000Z' });
    const second = runQualityCheck({ aggregate: report(), stage: 'field_submission', now: '2026-07-22T01:00:00.000Z' });
    expect(first.status).toBe('ready');
    expect(first.contentHash).toBe(second.contentHash);
  });

  it('blocks unsupported operational claims and Exit reports without baselines', () => {
    const aggregate = report();
    aggregate.report.inspectionType = 'exit';
    const component = aggregate.areas[0]!.components[0]!;
    component.workingStatus = 'operation_confirmed';
    component.testStatus = 'untested';
    const run = runQualityCheck({ aggregate, stage: 'field_submission' });
    expect(run.status).toBe('not_ready');
    expect(run.results.map((result) => result.ruleId)).toEqual(expect.arrayContaining(['exit.baseline', 'working_claim.test_method']));
  });
});
