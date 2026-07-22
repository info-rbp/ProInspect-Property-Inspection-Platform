import { createHash, randomUUID } from 'node:crypto';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentData, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  IMMUTABLE_REPORT_STATUSES,
  transitionReport,
  type InspectionJobStatus,
  type ReportAggregate,
  type ReportAreaRecord,
  type ReportComponentRecord,
  type ReportLifecycleStatus,
  type ReportMetadataRecord,
  type ReportReviewComment,
  type UserRole,
} from '@pcr/domain';
import type { ReportAggregateStore, ReportTransitionCommand } from './types.js';
import { runQualityCheck, type QualityRun, type QualityStage, type QualityWaiver } from '@pcr/quality';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';

const MAX_TRANSACTION_WRITES = 450;
const VERSIONED_STATUSES = new Set<ReportLifecycleStatus>(['approved_for_issue', 'tenant_submitted', 'finalised', 'archived']);

function adminApp() {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault() });
}

function now(): string {
  return new Date().toISOString();
}

function reportReference(agencyId: string, reportId: string) {
  return getFirestore(adminApp()).doc(`agencies/${agencyId}/reports/${reportId}`);
}

function error(code: string, status: number, message: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code, status, ...(details ? { details } : {}) });
}

function jobStatus(status: ReportLifecycleStatus): InspectionJobStatus {
  const mapping: Partial<Record<ReportLifecycleStatus, InspectionJobStatus>> = {
    draft: 'draft',
    internal_review: 'analyst_review_in_progress',
    photos_uploaded: 'photos_uploaded',
    analysis_queued: 'analysis_queued',
    analysis_running: 'analysis_running',
    analysis_complete: 'analysis_complete',
    review_required: 'review_required',
    changes_requested: 'changes_requested',
    approved_for_issue: 'ready_to_issue',
    issued_to_tenant: 'issued_to_tenant',
    tenant_response_in_progress: 'tenant_response_in_progress',
    tenant_submitted: 'tenant_submitted',
    agent_response_required: 'agent_response_required',
    finalisation_ready: 'finalisation_ready',
    finalised: 'finalised',
    archived: 'archived',
    cancelled: 'cancelled',
  };
  return mapping[status] ?? 'on_hold';
}

function metadataFromAggregate(aggregate: ReportAggregate, timestamp: string, version: number): ReportMetadataRecord {
  const componentCount = aggregate.areas.reduce((count, area) => count + area.components.length, 0);
  return {
    ...aggregate.report,
    id: aggregate.report.id,
    agencyId: aggregate.report.agencyId,
    lifecycleStatus: aggregate.report.lifecycleStatus ?? 'draft',
    areaCount: aggregate.areas.length,
    componentCount,
    createdAt: aggregate.report.createdAt ?? timestamp,
    updatedAt: timestamp,
    version,
    workspaceRevision: aggregate.report.workspaceRevision ?? 1,
    schemaVersion: aggregate.report.schemaVersion ?? 2,
  };
}

function areaRecord(aggregate: ReportAggregate, area: ReportAggregate['areas'][number], timestamp: string): ReportAreaRecord {
  return {
    id: area.id,
    agencyId: aggregate.report.agencyId,
    reportId: aggregate.report.id,
    name: area.name,
    sequence: area.sequence,
    ...(area.overallCommentary ? { overallCommentary: area.overallCommentary } : {}),
    componentCount: area.components.length,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function componentRecord(
  aggregate: ReportAggregate,
  areaId: string,
  component: ReportAggregate['areas'][number]['components'][number],
  timestamp: string,
): ReportComponentRecord {
  return {
    ...component,
    agencyId: aggregate.report.agencyId,
    reportId: aggregate.report.id,
    areaId,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function readAggregateInTransaction(
  transaction: Transaction,
  agencyId: string,
  reportId: string,
): Promise<{ report: ReportMetadataRecord; areas: ReportAreaRecord[]; components: ReportComponentRecord[] }> {
  const reference = reportReference(agencyId, reportId);
  const reportSnapshot = await transaction.get(reference);
  if (!reportSnapshot.exists) throw error('NOT_FOUND', 404, 'Report not found.');
  const report = reportSnapshot.data() as ReportMetadataRecord;
  const areaSnapshot = await transaction.get(reference.collection('areas'));
  const areas = areaSnapshot.docs.map((document) => document.data() as ReportAreaRecord).sort((left, right) => left.sequence - right.sequence);
  const components: ReportComponentRecord[] = [];
  for (const area of areas) {
    const componentSnapshot = await transaction.get(reference.collection('areas').doc(area.id).collection('components'));
    components.push(...componentSnapshot.docs.map((document) => document.data() as ReportComponentRecord));
  }
  return { report, areas, components };
}

function aggregateFromRecords(report: ReportMetadataRecord, areas: ReportAreaRecord[], components: ReportComponentRecord[]): ReportAggregate {
  return {
    report,
    areas: areas.map((area) => ({
      id: area.id,
      name: area.name,
      sequence: area.sequence,
      ...(area.overallCommentary ? { overallCommentary: area.overallCommentary } : {}),
      ...(area.version ? { version: area.version } : {}),
      components: components
        .filter((component) => component.areaId === area.id)
        .map((component) => {
          const copy = { ...component } as Record<string, unknown>;
          for (const field of ['agencyId', 'reportId', 'areaId', 'createdAt', 'updatedAt']) delete copy[field];
          return copy as ReportAggregate['areas'][number]['components'][number];
        }),
    })),
  };
}

function setVersionSnapshot(
  transaction: Transaction,
  reportRef: DocumentReference<DocumentData>,
  records: { report: ReportMetadataRecord; areas: ReportAreaRecord[]; components: ReportComponentRecord[] },
  command: ReportTransitionCommand,
  timestamp: string,
): string {
  const versionId = randomUUID();
  const versionRef = reportRef.collection('versions').doc(versionId);
  const contentHash = createHash('sha256').update(JSON.stringify(records)).digest('hex');
  transaction.create(versionRef, {
    id: versionId,
    agencyId: command.agencyId,
    reportId: command.reportId,
    lifecycleStatus: command.status,
    sequence: records.report.version + 1,
    areaCount: records.areas.length,
    componentCount: records.components.length,
    contentHash,
    immutable: true,
    createdAt: timestamp,
    createdBy: command.actorId,
    workspaceRevision: records.report.workspaceRevision,
    metadataSnapshot: records.report,
    ...(records.report.templateId ? { templateId: records.report.templateId } : {}),
    ...(records.report.templateVersion ? { templateVersion: records.report.templateVersion } : {}),
  });
  for (const area of records.areas) transaction.create(versionRef.collection('areas').doc(area.id), { ...area, versionId });
  for (const component of records.components) {
    transaction.create(versionRef.collection('areas').doc(component.areaId).collection('components').doc(component.id), { ...component, versionId });
  }
  return versionId;
}

function assertEditable(report: ReportMetadataRecord): void {
  if (IMMUTABLE_REPORT_STATUSES.has(report.lifecycleStatus)) throw error('REPORT_IMMUTABLE', 409, 'Finalised report data cannot be modified.');
}

function queueNextAction(status: ReportLifecycleStatus): string {
  const actions: Partial<Record<ReportLifecycleStatus, string>> = {
    draft: 'Complete field assessment', photos_uploaded: 'Queue structured analysis', analysis_queued: 'Monitor analysis',
    analysis_running: 'Monitor analysis', analysis_complete: 'Start analyst review', internal_review: 'Complete analyst review',
    review_required: 'Complete independent review', changes_requested: 'Resolve requested changes', approved_for_issue: 'Generate issue package',
    issued_to_tenant: 'Monitor tenant response', tenant_response_in_progress: 'Monitor tenant response', tenant_submitted: 'Review tenant response',
    agent_response_required: 'Resolve tenant response', finalisation_ready: 'Generate and verify final package', finalised: 'Verify archive', archived: 'No action', cancelled: 'No action',
  };
  return actions[status] ?? 'Review report';
}

function recordMaterialChange(
  transaction: Transaction,
  database: Firestore,
  input: {
    agencyId: string; report: ReportMetadataRecord; actorId: string; correlationId: string; eventType: string;
    entityType: string; entityId: string; aggregateVersion: number; payload?: Record<string, unknown>; timestamp: string;
  },
): void {
  const auditId = randomUUID();
  transaction.create(database.doc(`agencies/${input.agencyId}/auditEvents/${auditId}`), {
    id: auditId, agencyId: input.agencyId, entityType: input.entityType, entityId: input.entityId,
    eventType: input.eventType, actorId: input.actorId, timestamp: input.timestamp, correlationId: input.correlationId,
    metadata: input.payload ?? {},
  });
  const eventId = randomUUID();
  transaction.create(database.doc(`agencies/${input.agencyId}/outboxEvents/${eventId}`), {
    id: eventId, agencyId: input.agencyId, eventType: input.eventType, aggregateType: 'report', aggregateId: input.report.id,
    aggregateVersion: input.aggregateVersion, payload: input.payload ?? {}, correlationId: input.correlationId,
    status: 'pending', attempt: 0, availableAt: input.timestamp, createdAt: input.timestamp,
  });
  transaction.set(database.doc(`agencies/${input.agencyId}/workQueueItems/report-${input.report.id}`), {
    id: `report-${input.report.id}`, agencyId: input.agencyId, entityType: 'report', entityId: input.report.id,
    propertyId: input.report.propertyId ?? null, propertyAddress: input.report.propertyAddress,
    reportType: input.report.reportType, stage: input.report.lifecycleStatus,
    assignedUserIds: [input.report.assignedUserId, input.report.assignedAnalystId, input.report.assignedReviewerId].filter(Boolean),
    priority: input.report.lifecycleStatus === 'changes_requested' ? 'high' : 'normal', nextAction: queueNextAction(input.report.lifecycleStatus),
    updatedAt: input.timestamp, correlationId: input.correlationId,
  }, { merge: true });
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw error('VALIDATION_ERROR', 400, `${field} is required.`);
  return value.trim();
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw error('VALIDATION_ERROR', 400, `${field} must be a positive integer.`);
  return value;
}

function componentFromInput(
  component: Record<string, unknown>,
  identity: { id: string; agencyId: string; reportId: string; areaId: string; timestamp: string },
): ReportComponentRecord {
  for (const field of ['component', 'visibility', 'conditionCategory', 'cleanlinessCategory', 'workingStatus', 'testStatus', 'commentary', 'reviewStatus', 'comparisonStatus']) requiredText(component[field], field);
  if (!Array.isArray(component.defects) || component.defects.some((item) => typeof item !== 'string')) throw error('VALIDATION_ERROR', 400, 'defects must be an array of strings.');
  if (!Array.isArray(component.photoReferences)) throw error('VALIDATION_ERROR', 400, 'photoReferences must be an array.');
  if (typeof component.maintenanceRequired !== 'boolean') throw error('VALIDATION_ERROR', 400, 'maintenanceRequired must be a boolean.');
  return {
    ...component,
    id: identity.id,
    agencyId: identity.agencyId,
    reportId: identity.reportId,
    areaId: identity.areaId,
    version: 1,
    createdAt: identity.timestamp,
    updatedAt: identity.timestamp,
  } as unknown as ReportComponentRecord;
}

function assertSameIds(requested: string[], stored: string[], field: string): void {
  if (requested.length !== stored.length || requested.some((id) => !stored.includes(id))) {
    throw error('REORDER_SET_MISMATCH', 409, `${field} must contain every current record exactly once.`, { requested, stored });
  }
}

export class FirestoreReportAggregateStore implements ReportAggregateStore {
  async load(agencyId: string, reportId: string): Promise<ReportAggregate | undefined> {
    const reference = reportReference(agencyId, reportId);
    const reportSnapshot = await reference.get();
    if (!reportSnapshot.exists) return undefined;
    const report = reportSnapshot.data() as ReportMetadataRecord;
    if (report.agencyId !== agencyId) return undefined;
    const areaSnapshot = await reference.collection('areas').orderBy('sequence').get();
    const areas = areaSnapshot.docs.map((document) => document.data() as ReportAreaRecord);
    const components: ReportComponentRecord[] = [];
    for (const area of areas) {
      const componentSnapshot = await reference.collection('areas').doc(area.id).collection('components').get();
      components.push(...componentSnapshot.docs.map((document) => document.data() as ReportComponentRecord));
    }
    return aggregateFromRecords(report, areas, components);
  }

  async saveDraft(aggregate: ReportAggregate, expectedVersion: number | undefined, actorId: string): Promise<ReportAggregate> {
    const database = getFirestore(adminApp());
    const reference = reportReference(aggregate.report.agencyId, aggregate.report.id);
    const requestedWrites = 1 + aggregate.areas.length + aggregate.areas.reduce((count, area) => count + area.components.length, 0);
    if (requestedWrites > MAX_TRANSACTION_WRITES) throw error('REPORT_TOO_LARGE', 413, 'Report contains too many records for one atomic draft save.', { requestedWrites, maximum: MAX_TRANSACTION_WRITES });

    return database.runTransaction(async (transaction) => {
      const existingSnapshot = await transaction.get(reference);
      const existing = existingSnapshot.exists ? existingSnapshot.data() as ReportMetadataRecord : undefined;
      if (existing && IMMUTABLE_REPORT_STATUSES.has(existing.lifecycleStatus)) throw error('REPORT_IMMUTABLE', 409, 'Finalised report data cannot be modified.');
      if (existing && expectedVersion === undefined) throw error('EXPECTED_VERSION_REQUIRED', 400, 'expectedVersion is required when updating a report.');
      if (existing && existing.version !== expectedVersion) throw error('VERSION_CONFLICT', 409, 'The report has changed. Reload and retry.', {
        expectedVersion,
        actualVersion: existing.version,
        serverVersion: existing.version,
        serverRecord: existing,
        submittedRecord: aggregate.report,
      });
      if (!existing && expectedVersion !== undefined) throw error('VERSION_CONFLICT', 409, 'The report does not yet exist.');

      const oldAreaSnapshot = await transaction.get(reference.collection('areas'));
      const oldComponentReferences: DocumentReference[] = [];
      for (const areaDocument of oldAreaSnapshot.docs) {
        const oldComponents = await transaction.get(areaDocument.ref.collection('components'));
        oldComponentReferences.push(...oldComponents.docs.map((document) => document.ref));
      }
      const totalWrites = requestedWrites + oldAreaSnapshot.size + oldComponentReferences.length;
      if (totalWrites > MAX_TRANSACTION_WRITES) throw error('REPORT_TOO_LARGE', 413, 'Report replacement exceeds the atomic Firestore write limit.', { totalWrites, maximum: MAX_TRANSACTION_WRITES });

      for (const componentReference of oldComponentReferences) transaction.delete(componentReference);
      for (const areaDocument of oldAreaSnapshot.docs) transaction.delete(areaDocument.ref);

      const timestamp = now();
      const metadata = metadataFromAggregate(aggregate, timestamp, existing ? existing.version + 1 : 1);
      transaction.set(reference, { ...metadata, updatedBy: actorId, ...(existing ? {} : { createdBy: actorId }) });
      for (const area of aggregate.areas) {
        const storedArea = areaRecord(aggregate, area, timestamp);
        const areaRef = reference.collection('areas').doc(area.id);
        transaction.set(areaRef, storedArea);
        for (const component of area.components) transaction.set(areaRef.collection('components').doc(component.id), componentRecord(aggregate, area.id, component, timestamp));
      }
      return aggregateFromRecords(metadata, aggregate.areas.map((area) => areaRecord(aggregate, area, timestamp)), aggregate.areas.flatMap((area) => area.components.map((component) => componentRecord(aggregate, area.id, component, timestamp))));
    });
  }

  async updateMetadata(agencyId: string, reportId: string, patch: Record<string, unknown>, expectedVersion: number, actorId: string, correlationId: string): Promise<Record<string, unknown>> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    return database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw error('NOT_FOUND', 404, 'Report not found.');
      const report = snapshot.data() as ReportMetadataRecord;
      assertEditable(report);
      if (report.version !== expectedVersion) throw error('VERSION_CONFLICT', 409, 'Report metadata has changed. Reload and retry.', { expectedVersion, actualVersion: report.version });
      const timestamp = now();
      const updated: ReportMetadataRecord & Record<string, unknown> = {
        ...report, ...patch, version: report.version + 1, workspaceRevision: (report.workspaceRevision ?? 1) + 1,
        qualityStatus: 'not_run', updatedAt: timestamp, updatedBy: actorId,
      } as ReportMetadataRecord & Record<string, unknown>;
      delete updated.latestQualityRunId;
      transaction.update(reference, { ...patch, version: updated.version, workspaceRevision: updated.workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      recordMaterialChange(transaction, database, { agencyId, report: updated, actorId, correlationId, eventType: 'report.metadata_updated', entityType: 'report', entityId: reportId, aggregateVersion: updated.workspaceRevision, payload: { fields: Object.keys(patch) }, timestamp });
      return updated;
    });
  }

  async createArea(agencyId: string, reportId: string, area: Record<string, unknown>, actorId: string, correlationId: string): Promise<ReportAreaRecord> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    const areaId = typeof area.id === 'string' && area.id.trim() ? area.id.trim() : randomUUID();
    return database.runTransaction(async (transaction) => {
      const reportSnapshot = await transaction.get(reference);
      const areaReference = reference.collection('areas').doc(areaId);
      const areaSnapshot = await transaction.get(areaReference);
      if (!reportSnapshot.exists) throw error('NOT_FOUND', 404, 'Report not found.');
      if (areaSnapshot.exists) throw error('ALREADY_EXISTS', 409, 'Area already exists.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      assertEditable(report);
      const timestamp = now();
      const stored: ReportAreaRecord = {
        id: areaId, agencyId, reportId, name: requiredText(area.name, 'name'), sequence: requiredPositiveInteger(area.sequence, 'sequence'),
        ...(typeof area.overallCommentary === 'string' && area.overallCommentary.trim() ? { overallCommentary: area.overallCommentary.trim() } : {}),
        componentCount: 0, version: 1, createdAt: timestamp, updatedAt: timestamp,
      };
      const updatedReport = { ...report, areaCount: report.areaCount + 1, workspaceRevision: (report.workspaceRevision ?? 1) + 1, qualityStatus: 'not_run' as const, updatedAt: timestamp };
      transaction.create(areaReference, stored);
      transaction.update(reference, { areaCount: updatedReport.areaCount, workspaceRevision: updatedReport.workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.area_created', entityType: 'area', entityId: areaId, aggregateVersion: updatedReport.workspaceRevision, timestamp });
      return stored;
    });
  }

  async updateArea(agencyId: string, reportId: string, areaId: string, patch: Record<string, unknown>, expectedVersion: number, actorId: string, correlationId: string): Promise<ReportAreaRecord> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    const areaReference = reference.collection('areas').doc(areaId);
    return database.runTransaction(async (transaction) => {
      const [reportSnapshot, areaSnapshot] = await Promise.all([transaction.get(reference), transaction.get(areaReference)]);
      if (!reportSnapshot.exists || !areaSnapshot.exists) throw error('NOT_FOUND', 404, 'Report area not found.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      const existing = areaSnapshot.data() as ReportAreaRecord;
      assertEditable(report);
      if (existing.version !== expectedVersion) throw error('VERSION_CONFLICT', 409, 'Area has changed. Reload and retry.', { expectedVersion, actualVersion: existing.version });
      const timestamp = now();
      const updated: ReportAreaRecord = { ...existing, ...patch, id: areaId, agencyId, reportId, version: existing.version + 1, updatedAt: timestamp };
      const updatedReport = { ...report, workspaceRevision: (report.workspaceRevision ?? 1) + 1, qualityStatus: 'not_run' as const, updatedAt: timestamp };
      transaction.update(areaReference, { ...patch, version: updated.version, updatedAt: timestamp, updatedBy: actorId });
      transaction.update(reference, { workspaceRevision: updatedReport.workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.area_updated', entityType: 'area', entityId: areaId, aggregateVersion: updatedReport.workspaceRevision, payload: { fields: Object.keys(patch) }, timestamp });
      return updated;
    });
  }

  async deleteArea(agencyId: string, reportId: string, areaId: string, expectedVersion: number, actorId: string, correlationId: string): Promise<void> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    const areaReference = reference.collection('areas').doc(areaId);
    return database.runTransaction(async (transaction) => {
      const [reportSnapshot, areaSnapshot, componentSnapshot] = await Promise.all([
        transaction.get(reference), transaction.get(areaReference), transaction.get(areaReference.collection('components')),
      ]);
      if (!reportSnapshot.exists || !areaSnapshot.exists) throw error('NOT_FOUND', 404, 'Report area not found.');
      if (componentSnapshot.size + 5 > MAX_TRANSACTION_WRITES) throw error('REPORT_TOO_LARGE', 413, 'Area is too large to remove atomically.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      const area = areaSnapshot.data() as ReportAreaRecord;
      assertEditable(report);
      if (area.version !== expectedVersion) throw error('VERSION_CONFLICT', 409, 'Area has changed. Reload and retry.', { expectedVersion, actualVersion: area.version });
      const timestamp = now();
      const updatedReport = {
        ...report, areaCount: Math.max(0, report.areaCount - 1), componentCount: Math.max(0, report.componentCount - componentSnapshot.size),
        workspaceRevision: (report.workspaceRevision ?? 1) + 1, qualityStatus: 'not_run' as const, updatedAt: timestamp,
      };
      for (const component of componentSnapshot.docs) transaction.delete(component.ref);
      transaction.delete(areaReference);
      transaction.update(reference, { areaCount: updatedReport.areaCount, componentCount: updatedReport.componentCount, workspaceRevision: updatedReport.workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.area_deleted', entityType: 'area', entityId: areaId, aggregateVersion: updatedReport.workspaceRevision, payload: { componentCount: componentSnapshot.size }, timestamp });
    });
  }

  async createComponent(agencyId: string, reportId: string, areaId: string, component: Record<string, unknown>, actorId: string, correlationId: string): Promise<ReportComponentRecord> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    const areaReference = reference.collection('areas').doc(areaId);
    const componentId = typeof component.id === 'string' && component.id.trim() ? component.id.trim() : randomUUID();
    const componentReference = areaReference.collection('components').doc(componentId);
    return database.runTransaction(async (transaction) => {
      const [reportSnapshot, areaSnapshot, componentSnapshot] = await Promise.all([transaction.get(reference), transaction.get(areaReference), transaction.get(componentReference)]);
      if (!reportSnapshot.exists || !areaSnapshot.exists) throw error('NOT_FOUND', 404, 'Report area not found.');
      if (componentSnapshot.exists) throw error('ALREADY_EXISTS', 409, 'Component already exists.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      const area = areaSnapshot.data() as ReportAreaRecord;
      assertEditable(report);
      const timestamp = now();
      const stored = componentFromInput(component, { id: componentId, agencyId, reportId, areaId, timestamp });
      const updatedReport = { ...report, componentCount: report.componentCount + 1, workspaceRevision: (report.workspaceRevision ?? 1) + 1, qualityStatus: 'not_run' as const, updatedAt: timestamp };
      transaction.create(componentReference, stored);
      transaction.update(areaReference, { componentCount: area.componentCount + 1, version: area.version + 1, updatedAt: timestamp, updatedBy: actorId });
      transaction.update(reference, { componentCount: updatedReport.componentCount, workspaceRevision: updatedReport.workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.component_created', entityType: 'component', entityId: componentId, aggregateVersion: updatedReport.workspaceRevision, payload: { areaId }, timestamp });
      return stored;
    });
  }

  async updateComponent(agencyId: string, reportId: string, areaId: string, componentId: string, patch: Record<string, unknown>, expectedVersion: number, actorId: string, correlationId: string): Promise<ReportComponentRecord> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    const componentReference = reference.collection('areas').doc(areaId).collection('components').doc(componentId);
    return database.runTransaction(async (transaction) => {
      const [reportSnapshot, componentSnapshot] = await Promise.all([transaction.get(reference), transaction.get(componentReference)]);
      if (!reportSnapshot.exists || !componentSnapshot.exists) throw error('NOT_FOUND', 404, 'Report component not found.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      const existing = componentSnapshot.data() as ReportComponentRecord;
      assertEditable(report);
      if (existing.version !== expectedVersion) throw error('VERSION_CONFLICT', 409, 'Component has changed. Review the server version before retrying.', { expectedVersion, actualVersion: existing.version, serverRecord: existing, submittedPatch: patch });
      const timestamp = now();
      const updated: ReportComponentRecord = { ...existing, ...patch, id: componentId, agencyId, reportId, areaId, version: existing.version + 1, updatedAt: timestamp };
      const updatedReport = { ...report, workspaceRevision: (report.workspaceRevision ?? 1) + 1, qualityStatus: 'not_run' as const, updatedAt: timestamp };
      transaction.update(componentReference, { ...patch, version: updated.version, updatedAt: timestamp, updatedBy: actorId });
      transaction.update(reference, { workspaceRevision: updatedReport.workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.component_updated', entityType: 'component', entityId: componentId, aggregateVersion: updatedReport.workspaceRevision, payload: { areaId, fields: Object.keys(patch), invalidatedApproval: Boolean(report.reviewerApprovedAt) }, timestamp });
      return updated;
    });
  }

  async reorderAreas(agencyId: string, reportId: string, orderedIds: string[], actorId: string, correlationId: string): Promise<Record<string, unknown>> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    return database.runTransaction(async (transaction) => {
      const [reportSnapshot, areaSnapshot] = await Promise.all([transaction.get(reference), transaction.get(reference.collection('areas'))]);
      if (!reportSnapshot.exists) throw error('NOT_FOUND', 404, 'Report not found.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      assertEditable(report);
      assertSameIds(orderedIds, areaSnapshot.docs.map((document) => document.id), 'areaIds');
      const timestamp = now();
      orderedIds.forEach((id, index) => transaction.update(reference.collection('areas').doc(id), { sequence: index + 1, version: FieldValue.increment(1), updatedAt: timestamp, updatedBy: actorId }));
      const workspaceRevision = (report.workspaceRevision ?? 1) + 1;
      transaction.update(reference, { workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      const updatedReport = { ...report, workspaceRevision, qualityStatus: 'not_run' as const, updatedAt: timestamp };
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.areas_reordered', entityType: 'report', entityId: reportId, aggregateVersion: workspaceRevision, payload: { orderedIds }, timestamp });
      return { reportId, workspaceRevision, orderedIds };
    });
  }

  async reorderComponents(agencyId: string, reportId: string, areaId: string, orderedIds: string[], actorId: string, correlationId: string): Promise<Record<string, unknown>> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    const collection = reference.collection('areas').doc(areaId).collection('components');
    return database.runTransaction(async (transaction) => {
      const [reportSnapshot, componentSnapshot] = await Promise.all([transaction.get(reference), transaction.get(collection)]);
      if (!reportSnapshot.exists) throw error('NOT_FOUND', 404, 'Report not found.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      assertEditable(report);
      assertSameIds(orderedIds, componentSnapshot.docs.map((document) => document.id), 'componentIds');
      const timestamp = now();
      orderedIds.forEach((id, index) => transaction.update(collection.doc(id), { sequence: index + 1, version: FieldValue.increment(1), updatedAt: timestamp, updatedBy: actorId }));
      const workspaceRevision = (report.workspaceRevision ?? 1) + 1;
      transaction.update(reference, { workspaceRevision, qualityStatus: 'not_run', latestQualityRunId: FieldValue.delete(), analystApprovedAt: FieldValue.delete(), reviewerApprovedAt: FieldValue.delete(), updatedAt: timestamp, updatedBy: actorId });
      const updatedReport = { ...report, workspaceRevision, qualityStatus: 'not_run' as const, updatedAt: timestamp };
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.components_reordered', entityType: 'area', entityId: areaId, aggregateVersion: workspaceRevision, payload: { orderedIds }, timestamp });
      return { reportId, areaId, workspaceRevision, orderedIds };
    });
  }

  async runQuality(agencyId: string, reportId: string, stage: QualityStage, actorId: string, correlationId: string): Promise<QualityRun> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    return database.runTransaction(async (transaction) => {
      const records = await readAggregateInTransaction(transaction, agencyId, reportId);
      const aggregate = aggregateFromRecords(records.report, records.areas, records.components);
      const commentSnapshot = await transaction.get(database.collection(`agencies/${agencyId}/reportReviewComments`).where('reportId', '==', reportId));
      const openReviewComments = commentSnapshot.docs.map((document) => document.data() as ReportReviewComment);
      const template = WA_RESIDENTIAL_V1_TEMPLATES.find((candidate) => candidate.id === records.report.templateId && candidate.version === records.report.templateVersion);
      const run = runQualityCheck({
        aggregate, stage, openReviewComments,
        analystId: records.report.assignedAnalystId,
        reviewerId: records.report.assignedReviewerId,
        ...(template ? { template } : {}),
      });
      const runReference = reference.collection('qualityRuns').doc(run.id);
      const existing = await transaction.get(runReference);
      if (!existing.exists) transaction.create(runReference, { ...run, agencyId, createdBy: actorId });
      const qualityStatus = run.status === 'ready' ? 'ready' : 'not_ready';
      transaction.update(reference, { qualityStatus, latestQualityRunId: run.id, updatedAt: run.createdAt, updatedBy: actorId });
      const updatedReport = { ...records.report, qualityStatus, latestQualityRunId: run.id, updatedAt: run.createdAt } as ReportMetadataRecord;
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId, correlationId, eventType: 'report.quality_checked', entityType: 'report', entityId: reportId, aggregateVersion: records.report.workspaceRevision, payload: { runId: run.id, status: run.status, stage, blockerCount: run.results.filter((result) => result.blocking).length }, timestamp: run.createdAt });
      return run;
    });
  }

  async latestQuality(agencyId: string, reportId: string): Promise<QualityRun | undefined> {
    const report = await reportReference(agencyId, reportId).get();
    if (!report.exists) throw error('NOT_FOUND', 404, 'Report not found.');
    const metadata = report.data() as ReportMetadataRecord;
    if (!metadata.latestQualityRunId) return undefined;
    const run = await report.ref.collection('qualityRuns').doc(metadata.latestQualityRunId).get();
    return run.exists ? run.data() as QualityRun : undefined;
  }

  async waiveQuality(agencyId: string, reportId: string, runId: string, waiver: Omit<QualityWaiver, 'waivedAt'>, correlationId: string): Promise<QualityRun> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, reportId);
    const runReference = reference.collection('qualityRuns').doc(runId);
    return database.runTransaction(async (transaction) => {
      const [reportSnapshot, runSnapshot] = await Promise.all([transaction.get(reference), transaction.get(runReference)]);
      if (!reportSnapshot.exists || !runSnapshot.exists) throw error('NOT_FOUND', 404, 'Quality run not found.');
      const report = reportSnapshot.data() as ReportMetadataRecord;
      const run = runSnapshot.data() as QualityRun;
      if (run.workspaceRevision !== report.workspaceRevision || report.latestQualityRunId !== runId) throw error('QUALITY_RUN_STALE', 409, 'Quality run is stale for the current workspace.');
      const finding = run.results.find((result) => result.ruleId === waiver.ruleId && result.areaId === waiver.areaId && result.componentId === waiver.componentId);
      if (!finding || !finding.waiverEligible) throw error('QUALITY_WAIVER_NOT_ALLOWED', 409, 'This quality finding cannot be waived.');
      if (!waiver.reason.trim()) throw error('QUALITY_WAIVER_REASON_REQUIRED', 400, 'A waiver reason is required.');
      const storedWaiver: QualityWaiver = { ...waiver, reason: waiver.reason.trim(), waivedAt: now() };
      const waivers = [...run.waivers, storedWaiver];
      const unresolvedBlockers = run.results.filter((result) => result.blocking && !waivers.some((item) => item.ruleId === result.ruleId && item.areaId === result.areaId && item.componentId === result.componentId));
      const updated: QualityRun = { ...run, waivers, status: unresolvedBlockers.length ? 'not_ready' : 'ready' };
      const qualityStatus = updated.status === 'ready' ? 'waived' : 'not_ready';
      transaction.update(runReference, { waivers, status: updated.status });
      transaction.update(reference, { qualityStatus, updatedAt: storedWaiver.waivedAt, updatedBy: waiver.actorId });
      const updatedReport = { ...report, qualityStatus, updatedAt: storedWaiver.waivedAt } as ReportMetadataRecord;
      recordMaterialChange(transaction, database, { agencyId, report: updatedReport, actorId: waiver.actorId, correlationId, eventType: 'report.quality_waived', entityType: 'report', entityId: reportId, aggregateVersion: report.workspaceRevision, payload: { runId, ruleId: waiver.ruleId, areaId: waiver.areaId ?? null, componentId: waiver.componentId ?? null }, timestamp: storedWaiver.waivedAt });
      return updated;
    });
  }

  async transition(agencyId: string, command: ReportTransitionCommand): Promise<Record<string, unknown>> {
    const database = getFirestore(adminApp());
    const reference = reportReference(agencyId, command.reportId);
    return database.runTransaction(async (transaction) => {
      const records = await readAggregateInTransaction(transaction, agencyId, command.reportId);
      let jobSnapshot: DocumentSnapshot | undefined;
      if (records.report.inspectionJobId) {
        jobSnapshot = await transaction.get(database.doc(`agencies/${agencyId}/inspectionJobs/${records.report.inspectionJobId}`));
      }
      const qualitySnapshot = records.report.latestQualityRunId
        ? await transaction.get(reference.collection('qualityRuns').doc(records.report.latestQualityRunId))
        : undefined;
      const currentQuality = qualitySnapshot?.exists ? qualitySnapshot.data() as QualityRun : undefined;
      const commentSnapshot = await transaction.get(database.collection(`agencies/${agencyId}/reportReviewComments`).where('reportId', '==', command.reportId));
      const openBlockingComments = commentSnapshot.docs.filter((document) => {
        const comment = document.data() as ReportReviewComment;
        return comment.blocking && comment.status === 'open';
      });
      if (records.report.version !== command.expectedVersion) throw error('VERSION_CONFLICT', 409, 'The report has changed. Reload and retry.', { expectedVersion: command.expectedVersion, actualVersion: records.report.version });
      if (IMMUTABLE_REPORT_STATUSES.has(records.report.lifecycleStatus) && command.status !== 'archived') throw error('REPORT_IMMUTABLE', 409, 'Finalised report data cannot return to an editable lifecycle state.');
      if (command.status === 'approved_for_issue' && openBlockingComments.length) throw error('REVIEW_COMMENTS_OPEN', 409, 'Blocking review comments must be resolved before approval.', { commentIds: openBlockingComments.map((document) => document.id) });
      if (command.status === 'approved_for_issue' && records.report.assignedAnalystId && records.report.assignedAnalystId === command.actorId) throw error('SEPARATION_OF_DUTIES', 403, 'The analyst cannot approve the same report as reviewer.');

      const tenantPolicy = records.report.tenantReviewPolicy ?? 'disabled';
      const qualityCurrent = Boolean(currentQuality && currentQuality.workspaceRevision === records.report.workspaceRevision && currentQuality.status === 'ready');
      const analystDecision = Boolean(records.report.analystApprovedAt) || (command.status === 'review_required' && ['analyst', 'proinspect_admin', 'super_admin'].includes(command.actorRole));
      const reviewerDecision = Boolean(records.report.reviewerApprovedAt) || (command.status === 'approved_for_issue' && ['reviewer', 'proinspect_admin', 'super_admin'].includes(command.actorRole));
      const workflowEvent = transitionReport({
        entityId: command.reportId,
        current: records.report.lifecycleStatus,
        requested: command.status,
        currentVersion: records.report.version,
        expectedVersion: command.expectedVersion,
        actorId: command.actorId,
        actorRole: command.actorRole as UserRole,
        correlationId: command.correlationId,
        context: {
          requiredEvidenceComplete: qualityCurrent || records.report.qualityStatus === 'waived',
          requiredComponentsComplete: qualityCurrent || records.report.qualityStatus === 'waived',
          templateVersionAssigned: Boolean(records.report.templateId && records.report.templateVersion && records.report.templateHash),
          analysisComplete: ['analysis_complete', 'internal_review', 'review_required', 'changes_requested', 'approved_for_issue'].includes(records.report.lifecycleStatus),
          analystApproved: analystDecision,
          reviewerApproved: reviewerDecision,
          tenantResponseResolved: tenantPolicy === 'disabled' || Boolean(records.report.tenantResponseResolvedAt),
          finalPdfCreated: Boolean(records.report.pdfReference),
          archiveCreated: Boolean(records.report.archiveReference),
        },
        ...(command.reason ? { reason: command.reason } : {}),
      });

      const versionWrites = VERSIONED_STATUSES.has(command.status) ? 1 + records.areas.length + records.components.length : 0;
      const baseWrites = 3 + (jobSnapshot?.exists ? 1 : 0);
      if (versionWrites + baseWrites > MAX_TRANSACTION_WRITES) throw error('REPORT_TOO_LARGE', 413, 'Report version exceeds the atomic Firestore write limit.');

      const timestamp = now();
      const versionId = VERSIONED_STATUSES.has(command.status) ? setVersionSnapshot(transaction, reference, records, command, timestamp) : undefined;
      const updated = {
        ...records.report,
        lifecycleStatus: command.status,
        version: workflowEvent.resultingVersion,
        updatedAt: timestamp,
        updatedBy: command.actorId,
        ...(command.assignedUserId ? { assignedUserId: command.assignedUserId } : records.report.assignedUserId ? { assignedUserId: records.report.assignedUserId } : {}),
        ...(command.reason ? { transitionReason: command.reason } : {}),
        ...(versionId ? { currentVersionId: versionId } : {}),
        ...(command.status === 'review_required' ? { analystApprovedAt: timestamp } : {}),
        ...(command.status === 'approved_for_issue' ? { reviewerApprovedAt: timestamp } : {}),
        ...(command.status === 'finalised' ? { finalisedAt: timestamp } : {}),
      };
      if (command.status === 'changes_requested') delete updated.reviewerApprovedAt;
      transaction.set(reference, updated);

      if (jobSnapshot?.exists) {
        transaction.update(jobSnapshot.ref, {
          status: jobStatus(command.status),
          ...(command.assignedUserId ? { assignedUserId: command.assignedUserId } : {}),
          updatedAt: timestamp,
          updatedBy: command.actorId,
        });
      }

      const notificationId = randomUUID();
      transaction.create(database.doc(`agencies/${agencyId}/notificationJobs/${notificationId}`), {
        id: notificationId,
        agencyId,
        reportId: command.reportId,
        inspectionJobId: records.report.inspectionJobId ?? null,
        type: 'report_lifecycle_changed',
        status: 'queued',
        lifecycleStatus: command.status,
        queuedAt: timestamp,
        createdAt: timestamp,
        createdBy: command.actorId,
      });
      recordMaterialChange(transaction, database, { agencyId, report: updated, actorId: command.actorId, correlationId: command.correlationId, eventType: 'report.lifecycle_transition', entityType: 'report', entityId: command.reportId, aggregateVersion: updated.version, payload: { from: workflowEvent.from, to: workflowEvent.to, reason: workflowEvent.reason ?? null, versionId: versionId ?? null }, timestamp });
      return updated;
    });
  }
}
