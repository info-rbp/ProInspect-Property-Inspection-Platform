import type { ReportAggregate } from '@pcr/domain';
import type { QualityRun, QualityStage } from '@pcr/quality';
import { apiRequest } from '../../../services/apiClient';

type WorkspaceComponent = ReportAggregate['areas'][number]['components'][number];

export const updateReportComponent = (
  agencyId: string,
  reportId: string,
  areaId: string,
  componentId: string,
  patch: Partial<WorkspaceComponent>,
  expectedVersion: number,
) => apiRequest<WorkspaceComponent>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/areas/${encodeURIComponent(areaId)}/components/${encodeURIComponent(componentId)}`, {
  method: 'PATCH', body: { ...patch, expectedVersion }, baseVersion: expectedVersion,
  fieldPatchPaths: Object.keys(patch), localSnapshotId: `${reportId}:${componentId}`, conflictPolicy: 'manual',
  entityType: 'component', entityId: componentId, dirtyScopeId: `component:${componentId}`,
  action: 'update component assessment', queueWhenOffline: true,
});

export const runReportCommand = (agencyId: string, reportId: string, command: string, expectedVersion: number, reason?: string) =>
  apiRequest<Record<string, unknown>>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/commands/${command}`, {
    method: 'POST', body: { expectedVersion, ...(reason ? { reason } : {}) }, baseVersion: expectedVersion,
    entityType: 'report', entityId: reportId, action: command, queueWhenOffline: false,
  });

export const runReportQuality = (agencyId: string, reportId: string, stage: QualityStage) =>
  apiRequest<QualityRun>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/quality-runs`, {
    method: 'POST', body: { stage }, entityType: 'report', entityId: reportId, action: `quality ${stage}`, queueWhenOffline: false,
  });
