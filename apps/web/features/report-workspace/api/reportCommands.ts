import type { ReportAggregate } from '@pcr/domain';
import type { QualityRun, QualityStage } from '@pcr/quality';
import { apiRequest } from '../../../services/apiClient';

type WorkspaceArea = ReportAggregate['areas'][number];
type WorkspaceComponent = WorkspaceArea['components'][number];

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

export const createReportArea = (agencyId: string, reportId: string, input: Pick<WorkspaceArea, 'name' | 'sequence'> & Partial<Pick<WorkspaceArea, 'overallCommentary'>>) =>
  apiRequest<WorkspaceArea>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/areas`, {
    method: 'POST', body: input, entityType: 'area', action: 'create area', queueWhenOffline: false,
  });

export const updateReportArea = (agencyId: string, reportId: string, areaId: string, patch: Partial<Pick<WorkspaceArea, 'name' | 'sequence' | 'overallCommentary'>>, expectedVersion: number) =>
  apiRequest<WorkspaceArea>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/areas/${encodeURIComponent(areaId)}`, {
    method: 'PATCH', body: { ...patch, expectedVersion }, baseVersion: expectedVersion,
    entityType: 'area', entityId: areaId, action: 'update area', queueWhenOffline: false,
  });

export const deleteReportArea = (agencyId: string, reportId: string, areaId: string, expectedVersion: number) =>
  apiRequest<null>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/areas/${encodeURIComponent(areaId)}`, {
    method: 'DELETE', body: { expectedVersion }, baseVersion: expectedVersion,
    entityType: 'area', entityId: areaId, action: 'delete area', queueWhenOffline: false,
  });

export const createReportComponent = (agencyId: string, reportId: string, areaId: string, component: WorkspaceComponent) =>
  apiRequest<WorkspaceComponent>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/areas/${encodeURIComponent(areaId)}/components`, {
    method: 'POST', body: component, entityType: 'component', action: 'create component', queueWhenOffline: false,
  });

export const removeReportComponent = (agencyId: string, reportId: string, areaId: string, componentId: string, expectedVersion: number) =>
  apiRequest<ReportAggregate>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/commands/remove-component`, {
    method: 'POST', body: { areaId, componentId, expectedVersion }, baseVersion: expectedVersion,
    entityType: 'component', entityId: componentId, action: 'remove component', queueWhenOffline: false,
  });

export const reorderReportAreas = (agencyId: string, reportId: string, areaIds: string[]) =>
  apiRequest<Record<string, unknown>>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/commands/reorder-areas`, {
    method: 'POST', body: { areaIds }, entityType: 'report', entityId: reportId, action: 'reorder areas', queueWhenOffline: false,
  });

export const reorderReportComponents = (agencyId: string, reportId: string, areaId: string, componentIds: string[]) =>
  apiRequest<Record<string, unknown>>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/commands/reorder-components`, {
    method: 'POST', body: { areaId, componentIds }, entityType: 'area', entityId: areaId, action: 'reorder components', queueWhenOffline: false,
  });

export const cloneReport = (agencyId: string, reportId: string, options: { inspectionDate?: string; carryCommentary?: boolean; carryMaintenance?: boolean } = {}) =>
  apiRequest<{ reportId: string; aggregate: ReportAggregate }>(agencyId, `/api/v1/reports/${encodeURIComponent(reportId)}/commands/clone`, {
    method: 'POST', body: options, entityType: 'report', entityId: reportId, action: 'clone report', queueWhenOffline: false,
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
