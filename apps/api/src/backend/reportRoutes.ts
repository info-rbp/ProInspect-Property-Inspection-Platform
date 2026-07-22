import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AuthorisationTarget, ReportAggregate, ReportLifecycleStatus, SecurityCapability } from '@pcr/domain';
import { reportAggregateSchema, workflowTransitionSchema } from '@pcr/validation';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import type { ApiResponse } from './router.js';
import type { ApiDependencies, IdempotencyResult } from './types.js';

class ReportRouteError extends Error {
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
    if (length > 1_000_000) throw new ReportRouteError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    return parsed as Record<string, unknown>;
  } catch {
    throw new ReportRouteError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function parse<T>(result: { ok: true; value: T } | { ok: false; error: { status: number; code: string; message: string; details?: Record<string, unknown> } }): T {
  if (!result.ok) throw new ReportRouteError(result.error.status, result.error.code, result.error.message, result.error.details);
  return result.value;
}

function target(agencyId: string, reportId: string, aggregate: ReportAggregate, assignedUserId?: string): AuthorisationTarget {
  return {
    agencyId,
    reportId,
    ...(aggregate.report.propertyId ? { propertyId: aggregate.report.propertyId } : {}),
    ...(aggregate.report.tenancyId ? { tenancyId: aggregate.report.tenancyId } : {}),
    ...(aggregate.report.inspectionJobId ? { inspectionJobId: aggregate.report.inspectionJobId } : {}),
    lifecycleStatus: aggregate.report.lifecycleStatus,
    ...(assignedUserId ? { assignedReviewerId: assignedUserId } : {}),
  };
}

function idempotencyKey(req: IncomingMessage): string {
  const key = req.headers['idempotency-key']?.toString().trim();
  if (!key) throw new ReportRouteError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required for material writes.');
  if (key.length < 8 || key.length > 200) throw new ReportRouteError(400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must contain 8 to 200 characters.');
  return key;
}

function hash(body: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

async function idempotent(
  dependencies: ApiDependencies,
  req: IncomingMessage,
  agencyId: string,
  operation: string,
  body: Record<string, unknown>,
  action: () => Promise<IdempotencyResult>,
): Promise<ApiResponse> {
  const execution = await dependencies.idempotency.execute(agencyId, operation, idempotencyKey(req), hash(body), action);
  return { status: execution.result.status, body: execution.result.body, headers: { 'idempotency-replayed': String(execution.replayed) } };
}

export async function routeReportAggregateRequest(
  req: IncomingMessage,
  dependencies: ApiDependencies,
  correlationId: string,
  agencyId: string,
  reportId: string | undefined,
  path: string[],
): Promise<ApiResponse | undefined> {
  if (!reportId) return undefined;
  const command = path[0];

  if (req.method === 'GET' && command === 'aggregate') {
    const aggregate = await dependencies.reports.load(agencyId, reportId);
    if (!aggregate) throw new ReportRouteError(404, 'NOT_FOUND', 'Report not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, 'report.read', target(agencyId, reportId, aggregate), correlationId);
    return { status: 200, body: { data: aggregate, meta: { correlationId, actor: principal.uid } } };
  }

  if (req.method === 'GET' && command === 'workspace') {
    const aggregate = await dependencies.reports.load(agencyId, reportId);
    if (!aggregate) throw new ReportRouteError(404, 'NOT_FOUND', 'Report not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, 'report.read', target(agencyId, reportId, aggregate), correlationId);
    return { status: 200, body: { data: aggregate, meta: { correlationId, actor: principal.uid, workspaceRevision: aggregate.report.workspaceRevision ?? 1 } } };
  }

  if ((req.method === 'PUT' || req.method === 'POST') && command === 'aggregate') {
    const body = await readJson(req);
    const aggregate = parse(reportAggregateSchema.parse(body)) as ReportAggregate;
    if (aggregate.report.id !== reportId || aggregate.report.agencyId !== agencyId) {
      throw new ReportRouteError(400, 'REPORT_ID_MISMATCH', 'Report and agency identifiers must match the request path and headers.');
    }
    const expectedVersion = body.expectedVersion;
    if (expectedVersion !== undefined && (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1)) {
      throw new ReportRouteError(400, 'EXPECTED_VERSION_INVALID', 'expectedVersion must be a positive integer.');
    }
    const principal = await authenticateAndAuthorise(req, dependencies, 'report.edit', target(agencyId, reportId, aggregate), correlationId);
    return idempotent(dependencies, req, agencyId, `reports:${reportId}:aggregate`, body, async () => {
      const stored = await dependencies.reports.saveDraft(aggregate, expectedVersion as number | undefined, principal.uid);
      return { status: expectedVersion === undefined ? 201 : 200, body: { data: stored, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && command === 'transitions') {
    throw new ReportRouteError(410, 'GENERIC_TRANSITION_DISABLED', 'Use a named report workflow command.');
  }

  if (req.method === 'PATCH' && command === 'metadata') {
    const body = await readJson(req);
    const aggregate = await requiredAggregate(dependencies, agencyId, reportId);
    const principal = await authenticateAndAuthorise(req, dependencies, 'report.edit', target(agencyId, reportId, aggregate), correlationId);
    const version = requiredVersion(body);
    const patch = allow(body, ['propertyAddress', 'clientName', 'tenantName', 'inspectionDate', 'assignedAnalystId', 'assignedReviewerId', 'tenantReviewPolicy', 'tenantReviewDeadline']);
    return idempotent(dependencies, req, agencyId, `reports:${reportId}:metadata`, body, async () => ({
      status: 200,
      body: { data: await dependencies.reports.updateMetadata(agencyId, reportId, patch, version, principal.uid, correlationId), meta: { correlationId } },
    }));
  }

  if (command === 'areas') {
    const areaId = path[1];
    const nested = path[2];
    const componentId = path[3];
    const aggregate = await requiredAggregate(dependencies, agencyId, reportId);
    const principal = await authenticateAndAuthorise(req, dependencies, 'report.edit', target(agencyId, reportId, aggregate), correlationId);
    if (req.method === 'POST' && !areaId) {
      const body = await readJson(req);
      const area = allow(body, ['id', 'name', 'sequence', 'overallCommentary']);
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:areas:create`, body, async () => ({ status: 201, body: { data: await dependencies.reports.createArea(agencyId, reportId, area, principal.uid, correlationId), meta: { correlationId } } }));
    }
    if (areaId && !nested && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const body = await readJson(req);
      const version = requiredVersion(body);
      if (req.method === 'DELETE') return idempotent(dependencies, req, agencyId, `reports:${reportId}:areas:${areaId}:delete`, body, async () => {
        await dependencies.reports.deleteArea(agencyId, reportId, areaId, version, principal.uid, correlationId);
        return { status: 204, body: { data: null, meta: { correlationId } } };
      });
      const patch = allow(body, ['name', 'sequence', 'overallCommentary']);
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:areas:${areaId}:update`, body, async () => ({ status: 200, body: { data: await dependencies.reports.updateArea(agencyId, reportId, areaId, patch, version, principal.uid, correlationId), meta: { correlationId } } }));
    }
    if (areaId && nested === 'components') {
      const body = await readJson(req);
      if (req.method === 'POST' && !componentId) {
        const component = allow(body, COMPONENT_FIELDS);
        return idempotent(dependencies, req, agencyId, `reports:${reportId}:areas:${areaId}:components:create`, body, async () => ({ status: 201, body: { data: await dependencies.reports.createComponent(agencyId, reportId, areaId, component, principal.uid, correlationId), meta: { correlationId } } }));
      }
      if (req.method === 'PATCH' && componentId) {
        const version = requiredVersion(body);
        const patch = allow(body, COMPONENT_FIELDS.filter((field) => field !== 'id'));
        return idempotent(dependencies, req, agencyId, `reports:${reportId}:components:${componentId}:update`, body, async () => ({ status: 200, body: { data: await dependencies.reports.updateComponent(agencyId, reportId, areaId, componentId, patch, version, principal.uid, correlationId), meta: { correlationId } } }));
      }
    }
  }

  if (command === 'review-rounds' || command === 'review-comments') {
    const aggregate = await requiredAggregate(dependencies, agencyId, reportId);
    const collection = command === 'review-rounds' ? 'reportReviewRounds' : 'reportReviewComments';
    const recordId = path[1];
    if (req.method === 'GET' && !recordId) {
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.read', target(agencyId, reportId, aggregate), correlationId);
      const records = await dependencies.repository.list(collection, agencyId, 100);
      return { status: 200, body: { data: records.items.filter((item) => item.reportId === reportId), meta: { correlationId, actor: principal.uid } } };
    }
    if (req.method === 'POST' && !recordId) {
      const body = await readJson(req);
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.review', target(agencyId, reportId, aggregate), correlationId);
      const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
      const data = command === 'review-rounds'
        ? {
            reportId, workspaceRevision: aggregate.report.workspaceRevision ?? 1,
            analystId: aggregate.report.assignedAnalystId ?? null, reviewerId: aggregate.report.assignedReviewerId ?? null,
            outcome: 'in_progress', startedAt: new Date().toISOString(),
          }
        : {
            reportId, roundId: requiredString(body.roundId, 'roundId'), body: requiredString(body.body, 'body'),
            blocking: body.blocking !== false, status: 'open', createdBy: principal.uid, createdAt: new Date().toISOString(),
            ...(typeof body.areaId === 'string' ? { areaId: body.areaId } : {}),
            ...(typeof body.componentId === 'string' ? { componentId: body.componentId } : {}),
            ...(typeof body.evidenceId === 'string' ? { evidenceId: body.evidenceId } : {}),
          };
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:${command}:create`, body, async () => ({
        status: 201,
        body: { data: await dependencies.repository.create(collection, agencyId, id, data, principal.uid), meta: { correlationId } },
      }));
    }
    if (req.method === 'PATCH' && recordId) {
      const body = await readJson(req);
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.review', target(agencyId, reportId, aggregate), correlationId);
      const existing = await dependencies.repository.get(collection, agencyId, recordId);
      if (!existing || existing.reportId !== reportId) throw new ReportRouteError(404, 'NOT_FOUND', 'Review record not found.');
      const version = requiredVersion(body);
      const patch = command === 'review-comments'
        ? body.status === 'resolved'
          ? { status: 'resolved', resolvedBy: principal.uid, resolvedAt: new Date().toISOString() }
          : allow(body, ['body', 'blocking'])
        : allow(body, ['analystDecision', 'reviewerDecision', 'outcome', 'completedAt']);
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:${command}:${recordId}:update`, body, async () => ({
        status: 200,
        body: { data: await dependencies.repository.update(collection, agencyId, recordId, patch, version, principal.uid), meta: { correlationId } },
      }));
    }
  }

  if (command === 'quality-runs') {
    const runId = path[1];
    const nested = path[2];
    const aggregate = await requiredAggregate(dependencies, agencyId, reportId);
    if (req.method === 'GET' && runId === 'latest') {
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.read', target(agencyId, reportId, aggregate), correlationId);
      return { status: 200, body: { data: await dependencies.reports.latestQuality(agencyId, reportId) ?? null, meta: { correlationId, actor: principal.uid } } };
    }
    if (req.method === 'POST' && !runId) {
      const body = await readJson(req);
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.edit', target(agencyId, reportId, aggregate), correlationId);
      const stage = requiredQualityStage(body.stage);
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:quality:${stage}`, body, async () => ({ status: 201, body: { data: await dependencies.reports.runQuality(agencyId, reportId, stage, principal.uid, correlationId), meta: { correlationId } } }));
    }
    if (req.method === 'POST' && runId && nested === 'waivers') {
      const body = await readJson(req);
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.review', target(agencyId, reportId, aggregate), correlationId);
      const reason = requiredString(body.reason, 'reason');
      const ruleId = requiredString(body.ruleId, 'ruleId');
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:quality:${runId}:waiver`, body, async () => ({
        status: 200,
        body: { data: await dependencies.reports.waiveQuality(agencyId, reportId, runId, {
          ruleId, actorId: principal.uid, reason,
          ...(typeof body.areaId === 'string' ? { areaId: body.areaId } : {}),
          ...(typeof body.componentId === 'string' ? { componentId: body.componentId } : {}),
        }, correlationId), meta: { correlationId } },
      }));
    }
  }

  if (req.method === 'POST' && command === 'commands') {
    const namedCommand = path[1];
    const body = await readJson(req);
    const aggregate = await requiredAggregate(dependencies, agencyId, reportId);
    if (namedCommand === 'prepare-issue' || namedCommand === 'generate-issue-package' || namedCommand === 'generate-final-package') {
      const capability: SecurityCapability = namedCommand === 'generate-final-package' ? 'report.finalise' : 'pdf.create';
      const principal = await authenticateAndAuthorise(req, dependencies, capability, target(agencyId, reportId, aggregate), correlationId);
      const reportVersionId = aggregate.report.currentVersionId ?? aggregate.report.issueVersionId;
      if (!reportVersionId) throw new ReportRouteError(409, 'IMMUTABLE_VERSION_REQUIRED', 'Create an approved immutable report version before generating a package.');
      const taskId = createHash('sha256').update(`${agencyId}|${reportId}|${reportVersionId}|${namedCommand}`).digest('hex');
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:commands:${namedCommand}`, body, async () => {
        let task = await dependencies.repository.get('pdfJobs', agencyId, taskId);
        if (!task) {
          task = await dependencies.repository.create('pdfJobs', agencyId, taskId, {
            reportId, reportVersionId, templateId: aggregate.report.templateId, templateVersion: aggregate.report.templateVersion,
            workspaceRevision: aggregate.report.workspaceRevision, packageType: namedCommand === 'generate-final-package' ? 'final' : 'issue',
            status: 'queued', queuedAt: new Date().toISOString(), correlationId,
          }, principal.uid);
          await dependencies.tasks.dispatch('pdf', agencyId, taskId, task);
        }
        return { status: 202, body: { data: task, meta: { correlationId } } };
      });
    }
    if (namedCommand === 'reorder-areas') {
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.edit', target(agencyId, reportId, aggregate), correlationId);
      const orderedIds = requiredIds(body, 'areaIds');
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:reorder-areas`, body, async () => ({ status: 200, body: { data: await dependencies.reports.reorderAreas(agencyId, reportId, orderedIds, principal.uid, correlationId), meta: { correlationId } } }));
    }
    if (namedCommand === 'reorder-components') {
      const principal = await authenticateAndAuthorise(req, dependencies, 'report.edit', target(agencyId, reportId, aggregate), correlationId);
      const areaId = requiredString(body.areaId, 'areaId');
      const orderedIds = requiredIds(body, 'componentIds');
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:reorder-components`, body, async () => ({ status: 200, body: { data: await dependencies.reports.reorderComponents(agencyId, reportId, areaId, orderedIds, principal.uid, correlationId), meta: { correlationId } } }));
    }
    if (namedCommand === 'queue-analysis') {
      const principal = await authenticateAndAuthorise(req, dependencies, 'analysis.create', target(agencyId, reportId, aggregate), correlationId);
      const expectedVersion = requiredVersion(body);
      const evidence = aggregate.areas.flatMap((area) => area.components.flatMap((component) => component.photoReferences.map((photo) => ({
        photoId: photo.photoId, objectPath: photo.objectPath, objectGeneration: photo.generation, areaId: area.id, componentIds: [component.id],
      }))));
      if (!evidence.length || evidence.some((item) => !item.objectGeneration)) throw new ReportRouteError(409, 'IMMUTABLE_EVIDENCE_REQUIRED', 'Analysis requires validated evidence with immutable object generations.');
      const evidenceRecords = await Promise.all(evidence.map((item) => dependencies.repository.get('photoEvidence', agencyId, item.photoId)));
      const unavailable = evidence.filter((item, index) => {
        const stored = evidenceRecords[index];
        return !stored || stored.processingStatus !== 'available' || String(stored.generation) !== item.objectGeneration;
      });
      if (unavailable.length) throw new ReportRouteError(409, 'EVIDENCE_NOT_AVAILABLE', 'Analysis can start only after media validation and derivative processing complete.', { photoIds: unavailable.map((item) => item.photoId) });
      const groundedEvidence = evidence.map((item, index) => ({ ...item, contentType: String(evidenceRecords[index]!.contentType) }));
      const taskId = createHash('sha256').update(JSON.stringify({ agencyId, reportId, workspaceRevision: aggregate.report.workspaceRevision, templateId: aggregate.report.templateId, templateVersion: aggregate.report.templateVersion, evidence: groundedEvidence })).digest('hex');
      return idempotent(dependencies, req, agencyId, `reports:${reportId}:commands:queue-analysis`, body, async () => {
        let task = await dependencies.repository.get('analysisJobs', agencyId, taskId);
        if (!task) task = await dependencies.repository.create('analysisJobs', agencyId, taskId, {
          reportId, reportVersionId: aggregate.report.currentVersionId ?? `workspace-${aggregate.report.workspaceRevision ?? 1}`,
          workspaceRevision: aggregate.report.workspaceRevision ?? 1, templateId: aggregate.report.templateId,
          templateVersion: aggregate.report.templateVersion, promptVersion: 'report-analysis-v1',
          model: process.env.VERTEX_MODEL ?? 'gemini-2.5-flash', evidence: groundedEvidence, attempt: 0, maxAttempts: 4,
          status: 'pending_workflow', correlationId,
        }, principal.uid);
        const report = aggregate.report.lifecycleStatus === 'analysis_queued'
          ? aggregate.report as unknown as Record<string, unknown>
          : await dependencies.reports.transition(agencyId, {
              agencyId, reportId, status: 'analysis_queued', expectedVersion, actorId: principal.uid,
              actorRole: principal.role, correlationId,
            });
        if (task.status === 'pending_workflow') task = await dependencies.repository.update('analysisJobs', agencyId, taskId, { status: 'queued', queuedAt: new Date().toISOString() }, task.version, principal.uid);
        await dependencies.tasks.dispatch('analysis', agencyId, taskId, task);
        return { status: 202, body: { data: { task, report }, meta: { correlationId } } };
      });
    }
    const definitions: Record<string, { status: ReportLifecycleStatus; capability: SecurityCapability }> = {
      'start-analyst-review': { status: 'internal_review', capability: 'report.review' },
      'complete-analyst-review': { status: 'review_required', capability: 'report.review' },
      'request-changes': { status: 'changes_requested', capability: 'report.review' },
      approve: { status: 'approved_for_issue', capability: 'report.approve' },
      finalise: { status: 'finalised', capability: 'report.finalise' },
      archive: { status: 'archived', capability: 'report.archive' },
      cancel: { status: 'cancelled', capability: 'job.manage' },
    };
    const definition = namedCommand ? definitions[namedCommand] : undefined;
    if (!definition) throw new ReportRouteError(404, 'COMMAND_NOT_FOUND', 'Unknown report command.');
    const transition = parse(workflowTransitionSchema.parse({ ...body, status: definition.status }));
    const principal = await authenticateAndAuthorise(req, dependencies, definition.capability, target(agencyId, reportId, aggregate, transition.assignedUserId), correlationId);
    return idempotent(dependencies, req, agencyId, `reports:${reportId}:commands:${namedCommand}`, body, async () => ({
      status: 200,
      body: { data: await dependencies.reports.transition(agencyId, {
        agencyId, reportId, status: definition.status, expectedVersion: transition.expectedVersion,
        actorId: principal.uid, actorRole: principal.role, correlationId,
        ...(transition.reason ? { reason: transition.reason } : {}),
        ...(transition.assignedUserId ? { assignedUserId: transition.assignedUserId } : {}),
      }), meta: { correlationId } },
    }));
  }

  return undefined;
}

const COMPONENT_FIELDS = [
  'id', 'component', 'subComponent', 'material', 'colour', 'type', 'quantity', 'visibility', 'testingMethod',
  'conditionCategory', 'cleanlinessCategory', 'workingStatus', 'testStatus', 'defects', 'maintenanceRequired',
  'safetyConcern', 'maintenanceCandidateIds', 'commentary', 'photoReferences', 'reviewStatus', 'comparisonStatus',
  'sourceComponentId', 'comparisonConfidence', 'tenantResponseId', 'lastReviewedBy', 'lastReviewedAt',
];

function allow(body: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) if (body[field] !== undefined) output[field] = body[field];
  if (!Object.keys(output).length) throw new ReportRouteError(400, 'EMPTY_PATCH', 'At least one supported field is required.');
  return output;
}

function requiredVersion(body: Record<string, unknown>): number {
  const value = body.expectedVersion;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new ReportRouteError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a positive integer.');
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ReportRouteError(400, 'VALIDATION_ERROR', `${field} is required.`);
  return value.trim();
}

function requiredIds(body: Record<string, unknown>, field: string): string[] {
  const value = body[field];
  if (!Array.isArray(value) || !value.length || value.some((id) => typeof id !== 'string' || !id.trim()) || new Set(value).size !== value.length) {
    throw new ReportRouteError(400, 'VALIDATION_ERROR', `${field} must contain unique identifiers.`);
  }
  return value as string[];
}

function requiredQualityStage(value: unknown): 'field_submission' | 'analyst_completion' | 'reviewer_approval' | 'finalisation' | 'archive' {
  const stages = ['field_submission', 'analyst_completion', 'reviewer_approval', 'finalisation', 'archive'] as const;
  if (typeof value !== 'string' || !stages.includes(value as typeof stages[number])) throw new ReportRouteError(400, 'VALIDATION_ERROR', 'stage is not supported.');
  return value as typeof stages[number];
}

async function requiredAggregate(dependencies: ApiDependencies, agencyId: string, reportId: string): Promise<ReportAggregate> {
  const aggregate = await dependencies.reports.load(agencyId, reportId);
  if (!aggregate) throw new ReportRouteError(404, 'NOT_FOUND', 'Report not found.');
  return aggregate;
}
