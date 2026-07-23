import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { ReportAggregate, SecurityCapability } from '@pcr/domain';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import type { ApiResponse } from './router.js';
import type { ApiDependencies, IdempotencyResult } from './types.js';

class BatchOneReportError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new BatchOneReportError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new BatchOneReportError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function key(req: IncomingMessage): string {
  const value = req.headers['idempotency-key']?.toString().trim();
  if (!value || value.length < 8 || value.length > 200) throw new BatchOneReportError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required.');
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function idempotent(
  dependencies: ApiDependencies,
  req: IncomingMessage,
  agencyId: string,
  operation: string,
  body: Record<string, unknown>,
  action: () => Promise<IdempotencyResult>,
): Promise<ApiResponse> {
  const execution = await dependencies.idempotency.execute(agencyId, operation, key(req), hash(body), action);
  return { status: execution.result.status, body: execution.result.body, headers: { 'idempotency-replayed': String(execution.replayed) } };
}

function target(agencyId: string, aggregate: ReportAggregate) {
  return {
    agencyId,
    reportId: aggregate.report.id,
    ...(aggregate.report.propertyId ? { propertyId: aggregate.report.propertyId } : {}),
    ...(aggregate.report.tenancyId ? { tenancyId: aggregate.report.tenancyId } : {}),
    ...(aggregate.report.inspectionJobId ? { inspectionJobId: aggregate.report.inspectionJobId } : {}),
    lifecycleStatus: aggregate.report.lifecycleStatus,
  };
}

async function audit(
  dependencies: ApiDependencies,
  principal: { uid: string; role: string; agencyId: string },
  capability: SecurityCapability,
  action: string,
  correlationId: string,
  source: ReportAggregate,
  targetReportId: string,
): Promise<void> {
  await dependencies.audit.append({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    actorId: principal.uid,
    actorRole: principal.role,
    agencyId: principal.agencyId,
    capability,
    outcome: 'allowed',
    reason: `material_action:${action}`,
    target: {
      agencyId: principal.agencyId,
      reportId: targetReportId,
      ...(source.report.propertyId ? { propertyId: source.report.propertyId } : {}),
      ...(source.report.tenancyId ? { tenancyId: source.report.tenancyId } : {}),
    },
    correlationId,
  });
}

function clonedAggregate(
  source: ReportAggregate,
  targetReportId: string,
  actorId: string,
  body: Record<string, unknown>,
): ReportAggregate {
  const carryCommentary = body.carryCommentary === true;
  const carryMaintenance = body.carryMaintenance === true;
  const timestamp = new Date().toISOString();
  const draft: ReportAggregate = {
    report: {
      ...source.report,
      id: targetReportId,
      lifecycleStatus: 'draft',
      inspectionJobId: undefined,
      currentVersionId: undefined,
      issueVersionId: undefined,
      finalVersionId: undefined,
      pdfReference: undefined,
      archiveReference: undefined,
      analysisResultId: undefined,
      latestQualityRunId: undefined,
      qualityStatus: 'not_run',
      workspaceRevision: 1,
      schemaVersion: source.report.schemaVersion ?? 2,
      assignedUserId: undefined,
      analystApprovedAt: undefined,
      reviewerApprovedAt: undefined,
      tenantResponseResolvedAt: undefined,
      finalisedAt: undefined,
      inspectionDate: typeof body.inspectionDate === 'string' ? body.inspectionDate : '',
      sourceReportIds: [...new Set([...(source.report.sourceReportIds ?? []), source.report.id])],
      baselineVersionIds: source.report.currentVersionId ? [source.report.currentVersionId] : source.report.baselineVersionIds,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: undefined,
      templateAssignment: source.report.templateAssignment ? {
        ...source.report.templateAssignment,
        assignedAt: timestamp,
        assignedBy: actorId,
      } : undefined,
    },
    areas: source.areas.map((area, areaIndex) => ({
      id: randomUUID(),
      name: area.name,
      sequence: areaIndex + 1,
      overallCommentary: carryCommentary ? area.overallCommentary : undefined,
      components: area.components.map((component) => ({
        ...component,
        id: randomUUID(),
        sourceComponentId: component.id,
        visibility: 'visible',
        conditionCategory: 'unable_to_confirm',
        cleanlinessCategory: 'unable_to_confirm',
        workingStatus: 'untested',
        testStatus: 'untested',
        testingMethod: 'not_tested',
        defects: carryMaintenance && component.maintenanceRequired ? [...component.defects] : [],
        maintenanceRequired: carryMaintenance && component.maintenanceRequired,
        safetyConcern: false,
        maintenanceCandidateIds: [],
        commentary: carryCommentary ? component.commentary : 'Assessment pending.',
        photoReferences: [],
        aiConfidence: undefined,
        reviewStatus: 'draft',
        comparisonStatus: 'not_compared',
        comparisonConfidence: undefined,
        tenantResponseId: undefined,
        lastReviewedBy: undefined,
        lastReviewedAt: undefined,
        version: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      })),
    })),
  };
  return clean(draft);
}

export async function routeBatchOneReportRequest(
  req: IncomingMessage,
  dependencies: ApiDependencies,
  correlationId: string,
  agencyId: string,
  reportId: string | undefined,
  path: string[],
): Promise<ApiResponse | undefined> {
  if (!reportId || req.method !== 'POST' || path[0] !== 'commands' || !path[1]) return undefined;
  const command = path[1];
  if (!['clone', 'remove-component'].includes(command)) return undefined;
  const body = await readJson(req);
  const source = await dependencies.reports.load(agencyId, reportId);
  if (!source) throw new BatchOneReportError(404, 'NOT_FOUND', 'Report not found.');
  const principal = await authenticateAndAuthorise(req, dependencies, 'report.edit', target(agencyId, source), correlationId);

  if (command === 'clone') {
    return idempotent(dependencies, req, agencyId, `reports:${reportId}:commands:clone`, body, async () => {
      const targetReportId = typeof body.targetReportId === 'string' && body.targetReportId.trim() ? body.targetReportId.trim() : randomUUID();
      if (await dependencies.reports.load(agencyId, targetReportId)) throw new BatchOneReportError(409, 'TARGET_REPORT_EXISTS', 'The clone target already exists.');
      const clone = clonedAggregate(source, targetReportId, principal.uid, body);
      const stored = await dependencies.reports.saveDraft(clone, undefined, principal.uid);
      const eventId = randomUUID();
      await dependencies.repository.create('outboxEvents', agencyId, eventId, {
        eventType: 'report.cloned', aggregateType: 'report', aggregateId: targetReportId,
        aggregateVersion: stored.report.workspaceRevision ?? 1,
        payload: { sourceReportId: reportId, targetReportId, carryCommentary: body.carryCommentary === true, carryMaintenance: body.carryMaintenance === true },
        correlationId, status: 'pending', attempt: 0, availableAt: new Date().toISOString(),
      }, principal.uid);
      await audit(dependencies, principal, 'report.edit', 'report.clone', correlationId, source, targetReportId);
      return { status: 201, body: { data: { reportId: targetReportId, aggregate: stored }, meta: { correlationId } } };
    });
  }

  const areaId = typeof body.areaId === 'string' ? body.areaId : '';
  const componentId = typeof body.componentId === 'string' ? body.componentId : '';
  const expectedVersion = Number(body.expectedVersion);
  if (!areaId || !componentId) throw new BatchOneReportError(400, 'VALIDATION_ERROR', 'areaId and componentId are required.');
  if (!Number.isInteger(expectedVersion) || expectedVersion !== source.report.version) {
    throw new BatchOneReportError(409, 'VERSION_CONFLICT', 'The report has changed. Reload and retry.', { expectedVersion, actualVersion: source.report.version });
  }
  return idempotent(dependencies, req, agencyId, `reports:${reportId}:commands:remove-component:${componentId}`, body, async () => {
    const area = source.areas.find((candidate) => candidate.id === areaId);
    if (!area || !area.components.some((component) => component.id === componentId)) throw new BatchOneReportError(404, 'COMPONENT_NOT_FOUND', 'Report component was not found.');
    if (area.components.length === 1) throw new BatchOneReportError(409, 'AREA_COMPONENT_REQUIRED', 'An area must retain at least one component.');
    const updated: ReportAggregate = {
      ...source,
      areas: source.areas.map((candidate) => candidate.id === areaId ? {
        ...candidate,
        components: candidate.components.filter((component) => component.id !== componentId),
      } : candidate),
    };
    const stored = await dependencies.reports.saveDraft(updated, expectedVersion, principal.uid);
    await audit(dependencies, principal, 'report.edit', 'report.component_removed', correlationId, source, reportId);
    return { status: 200, body: { data: stored, meta: { correlationId } } };
  });
}
