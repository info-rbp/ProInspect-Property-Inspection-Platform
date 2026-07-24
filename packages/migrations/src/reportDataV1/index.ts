import { createHash } from 'node:crypto';
import type { ReportAggregate, ReportPhotoReference } from '@pcr/domain';

export type EvidenceMappingMethod =
  | 'explicit_legacy_link'
  | 'filename_reference'
  | 'comment_reference'
  | 'manual_review'
  | 'area_only'
  | 'unmatched';

export interface EvidenceMigrationMapping {
  legacyPhotoId: string;
  sourceRoomId: string;
  targetAreaId: string;
  targetComponentIds: string[];
  mappingMethod: EvidenceMappingMethod;
  confidence?: number;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface LegacyPhotoV1 {
  id: string;
  objectPath: string;
  generation?: string;
  sha256?: string;
  caption?: string;
  componentIds?: string[];
}

export interface LegacyComponentV1 {
  id: string;
  name: string;
  commentary?: string;
  photoIds?: string[];
}

export interface LegacyRoomV1 {
  id: string;
  name: string;
  photos?: LegacyPhotoV1[];
  components?: LegacyComponentV1[];
}

export interface LegacyReportDataV1 {
  id: string;
  agencyId: string;
  propertyId: string;
  propertyAddress: string;
  reportType: string;
  inspectionDate?: string;
  rooms: LegacyRoomV1[];
}

export interface MigrationWarning {
  code: 'AMBIGUOUS_EVIDENCE' | 'UNMATCHED_EVIDENCE' | 'MISSING_HASH' | 'MISSING_COMPONENT';
  message: string;
  sourceId: string;
  reviewRequired: boolean;
}

export interface ReportDataV1MigrationManifest {
  migrationId: string;
  sourceReportId: string;
  targetReportId: string;
  sourceHash: string;
  targetHash: string;
  mappingVersion: 'report-data-v1';
  mappings: EvidenceMigrationMapping[];
  warnings: MigrationWarning[];
  rollback: {
    sourceCollection: string;
    sourceRecordId: string;
    targetReportId: string;
    targetAreaIds: string[];
    targetComponentIds: string[];
  };
}

export interface ConvertReportDataV1Input {
  source: LegacyReportDataV1;
  targetReportId: string;
  templateId: string;
  templateVersion: number;
  templateHash: string;
  actorId: string;
  createdAt: string;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function photoReference(photo: LegacyPhotoV1): ReportPhotoReference {
  return {
    photoId: photo.id,
    objectPath: photo.objectPath,
    ...(photo.generation ? { generation: photo.generation } : {}),
    ...(photo.sha256 ? { sha256: photo.sha256 } : {}),
    ...(photo.caption ? { caption: photo.caption } : {}),
    purpose: 'context',
  };
}

export function convertReportDataV1(input: ConvertReportDataV1Input): {
  aggregate: ReportAggregate;
  manifest: ReportDataV1MigrationManifest;
} {
  const mappings: EvidenceMigrationMapping[] = [];
  const warnings: MigrationWarning[] = [];

  const areas = input.source.rooms.map((room, areaIndex) => {
    const photos = room.photos ?? [];
    const components = room.components ?? [];
    const explicitByComponent = new Map<string, LegacyPhotoV1[]>();
    const assignedPhotoIds = new Set<string>();

    for (const component of components) {
      const explicit = photos.filter((photo) =>
        component.photoIds?.includes(photo.id) || photo.componentIds?.includes(component.id),
      );
      explicitByComponent.set(component.id, explicit);
      for (const photo of explicit) assignedPhotoIds.add(photo.id);
    }

    for (const photo of photos) {
      const targetComponentIds = components
        .filter((component) => component.photoIds?.includes(photo.id) || photo.componentIds?.includes(component.id))
        .map((component) => component.id);
      const mappingMethod: EvidenceMappingMethod = targetComponentIds.length
        ? 'explicit_legacy_link'
        : 'area_only';
      mappings.push({
        legacyPhotoId: photo.id,
        sourceRoomId: room.id,
        targetAreaId: room.id,
        targetComponentIds,
        mappingMethod,
        ...(targetComponentIds.length ? { confidence: 1 } : {}),
      });
      if (!photo.sha256) warnings.push({
        code: 'MISSING_HASH',
        message: 'Evidence hash is missing and must be verified before finalisation.',
        sourceId: photo.id,
        reviewRequired: true,
      });
      if (!targetComponentIds.length) warnings.push({
        code: 'UNMATCHED_EVIDENCE',
        message: 'Evidence was retained at area level instead of being copied to every component.',
        sourceId: photo.id,
        reviewRequired: true,
      });
    }

    return {
      id: room.id,
      name: room.name,
      sequence: areaIndex + 1,
      overallCommentary: photos.filter((photo) => !assignedPhotoIds.has(photo.id)).length
        ? 'Legacy area-level evidence retained for manual review.'
        : undefined,
      components: components.map((component) => ({
        id: component.id,
        component: component.name,
        visibility: 'visible' as const,
        testingMethod: 'not_tested' as const,
        conditionCategory: 'unable_to_confirm' as const,
        cleanlinessCategory: 'unable_to_confirm' as const,
        workingStatus: 'untested' as const,
        testStatus: 'untested' as const,
        defects: [],
        maintenanceRequired: false,
        commentary: component.commentary ?? '',
        photoReferences: (explicitByComponent.get(component.id) ?? []).map(photoReference),
        reviewStatus: 'draft' as const,
        comparisonStatus: 'not_compared' as const,
      })),
    };
  });

  const aggregate: ReportAggregate = {
    report: {
      id: input.targetReportId,
      agencyId: input.source.agencyId,
      origin: 'historical_import',
      propertyId: input.source.propertyId,
      reportType: input.source.reportType,
      propertyAddress: input.source.propertyAddress,
      lifecycleStatus: 'draft',
      inspectionDate: input.source.inspectionDate,
      templateId: input.templateId,
      templateVersion: input.templateVersion,
      templateHash: input.templateHash,
      createdBy: input.actorId,
      createdAt: input.createdAt,
      importMappingVersion: 'report-data-v1',
      qualityStatus: 'not_run',
    } as ReportAggregate['report'],
    areas,
  };

  const manifest: ReportDataV1MigrationManifest = {
    migrationId: stableHash({ source: input.source.id, target: input.targetReportId, mappingVersion: 'report-data-v1' }).slice(0, 32),
    sourceReportId: input.source.id,
    targetReportId: input.targetReportId,
    sourceHash: stableHash(input.source),
    targetHash: stableHash(aggregate),
    mappingVersion: 'report-data-v1',
    mappings,
    warnings,
    rollback: {
      sourceCollection: 'legacyReportDataV1',
      sourceRecordId: input.source.id,
      targetReportId: input.targetReportId,
      targetAreaIds: areas.map((area) => area.id),
      targetComponentIds: areas.flatMap((area) => area.components.map((component) => component.id)),
    },
  };

  return { aggregate, manifest };
}

export type ReportDataV1MigrationMode = 'inventory' | 'dry_run' | 'execute' | 'verify' | 'rollback';

export interface ReportDataV1MigrationCheckpoint {
  migrationId: string;
  mode: ReportDataV1MigrationMode;
  cursor?: string;
  processed: number;
  succeeded: number;
  failed: number;
  completed: boolean;
  updatedAt: string;
}
