import type { ReportAggregate } from '@pcr/domain';
import type { ReportData } from '../../../types';

export interface LegacyMigrationResult {
  aggregate: ReportAggregate;
  warnings: string[];
}

function inspectionType(reportType: string): ReportAggregate['report']['inspectionType'] {
  if (/exit/iu.test(reportType)) return 'exit';
  if (/routine/iu.test(reportType)) return 'routine';
  return 'entry';
}

export function adaptLegacyReport(report: ReportData, agencyId: string): LegacyMigrationResult {
  const warnings: string[] = ['Opened through the legacy recovery adapter. Confirm visibility, testing and evidence links before submission.'];
  const aggregate: ReportAggregate = {
    report: {
      id: report.id,
      agencyId: report.agencyId ?? agencyId,
      ...(report.propertyId ? { propertyId: report.propertyId } : {}),
      ...(report.tenancyId ? { tenancyId: report.tenancyId } : {}),
      ...(report.inspectionJobId ? { inspectionJobId: report.inspectionJobId } : {}),
      inspectionType: inspectionType(report.reportType),
      reportType: report.reportType,
      propertyAddress: report.propertyAddress || 'Address not recorded',
      clientName: report.clientName,
      tenantName: report.tenantName,
      inspectionDate: report.inspectionDate,
      lifecycleStatus: report.lifecycleStatus ?? 'draft',
      workspaceRevision: 1,
      schemaVersion: 2,
      qualityStatus: 'not_run',
      ...(report.version ? { version: report.version } : {}),
      ...(report.createdAt ? { createdAt: report.createdAt } : {}),
      ...(report.updatedAt ? { updatedAt: report.updatedAt } : {}),
    },
    areas: report.rooms.map((room, areaIndex) => ({
      id: room.id,
      name: room.name,
      sequence: areaIndex + 1,
      version: 1,
      ...(room.overallComment ? { overallCommentary: room.overallComment } : {}),
      components: room.items.map((item) => {
        const explicitEvidence = room.photos.length === 1 ? room.photos : [];
        if (room.photos.length > 1) warnings.push(`${room.name} / ${item.name}: room-level photos were not copied to the component because the relationship is ambiguous.`);
        return {
          id: item.id,
          component: item.name,
          visibility: explicitEvidence.length ? 'visible' as const : 'not_visible' as const,
          testingMethod: 'not_tested' as const,
          conditionCategory: item.isUndamaged ? 'intact' as const : 'repair_required' as const,
          cleanlinessCategory: item.isClean ? 'clean' as const : 'requires_cleaning' as const,
          workingStatus: 'untested' as const,
          testStatus: 'untested' as const,
          defects: item.isUndamaged ? [] : [item.comment || 'Legacy condition issue recorded.'],
          maintenanceRequired: !item.isUndamaged,
          commentary: item.comment || `${item.name} migrated from the legacy report; assessment confirmation is required.`,
          photoReferences: explicitEvidence.flatMap((photo) => photo.objectPath ? [{ photoId: photo.id, objectPath: photo.objectPath, ...(photo.thumbnailObjectPath ? { thumbnailObjectPath: photo.thumbnailObjectPath } : {}) }] : []),
          reviewStatus: 'draft' as const,
          comparisonStatus: 'not_compared' as const,
          version: 1,
        };
      }),
    })),
  };
  return { aggregate, warnings: [...new Set(warnings)] };
}
