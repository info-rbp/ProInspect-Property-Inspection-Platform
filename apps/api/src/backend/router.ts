import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  transitionComparison,
  transitionDelivery,
  transitionEvidencePack,
  transitionFieldAttendance,
  transitionImport,
  transitionMaintenance,
  transitionPortfolioAudit,
  transitionServiceOrder,
  type ComparisonRunRecord,
  type DeliveryPackageRecord,
  type DomainErrorShape,
  type EvidencePackRecord,
  type FieldAttendanceRecord,
  type ImportJobRecord,
  type MaintenanceItemRecord,
  type PortfolioAuditRunRecord,
  type SecurityCapability,
  type ServiceOrderRecord,
} from '@pcr/domain';
import { materialisePublishedTemplate } from '@pcr/templates';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';
import {
  resourceWriteSchema,
  taskCreationSchema,
  tenantResponseSchema,
  uploadSessionSchema,
  workflowTransitionSchema,
} from '@pcr/validation';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import { ROUTE_POLICIES } from './routeCatalog.js';
import type { ApiDependencies, IdempotencyResult } from './types.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function agencyHeader(req: IncomingMessage): string {
  const value = req.headers['x-agency-id']?.toString().trim();
  if (!value) throw new ApiError(400, 'AGENCY_HEADER_REQUIRED', 'x-agency-id is required.');
  return value;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required');
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function validation<T>(result: { ok: true; value: T } | { ok: false; error: DomainErrorShape }): T {
  if (!result.ok) throw new ApiError(result.error.status, result.error.code, result.error.message, result.error.details);
  return result.value;
}

function idempotencyKey(req: IncomingMessage): string {
  const key = req.headers['idempotency-key']?.toString().trim();
  if (!key) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key is required for material writes.');
  if (key.length < 8 || key.length > 200) throw new ApiError(400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key must contain 8 to 200 characters.');
  return key;
}

function payloadHash(body: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function expectedVersion(body: Record<string, unknown>): number {
  const value = body.expectedVersion;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new ApiError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a positive integer.');
  return value;
}

function writeBody(body: Record<string, unknown>): Record<string, unknown> {
  const data = { ...validation(resourceWriteSchema.parse(body)) };
  delete data.id;
  delete data.agencyId;
  delete data.version;
  delete data.expectedVersion;
  return data;
}

async function appendMaterialAudit(
  dependencies: ApiDependencies,
  principal: { uid: string; role: string; agencyId: string },
  capability: SecurityCapability,
  action: string,
  correlationId: string,
  target: Record<string, unknown>,
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
      ...(typeof target.propertyId === 'string' ? { propertyId: target.propertyId } : {}),
      ...(typeof target.tenancyId === 'string' ? { tenancyId: target.tenancyId } : {}),
      ...(typeof target.inspectionJobId === 'string' ? { inspectionJobId: target.inspectionJobId } : {}),
      ...(typeof target.reportId === 'string' ? { reportId: target.reportId } : {}),
    },
    correlationId,
  });
}

async function idempotent(
  dependencies: ApiDependencies,
  req: IncomingMessage,
  agencyId: string,
  operation: string,
  body: Record<string, unknown>,
  action: () => Promise<IdempotencyResult>,
): Promise<ApiResponse> {
  const execution = await dependencies.idempotency.execute(agencyId, operation, idempotencyKey(req), payloadHash(body), action);
  return {
    status: execution.result.status,
    body: execution.result.body,
    headers: { 'idempotency-replayed': String(execution.replayed) },
  };
}

function routeParts(urlValue: string | undefined): string[] {
  const url = new URL(urlValue ?? '/', 'http://localhost');
  return url.pathname.split('/').filter(Boolean);
}

function requiredText(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'VALIDATION_ERROR', `${field} is required.`);
  return value.trim();
}

function optionalStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) throw new ApiError(400, 'VALIDATION_ERROR', `${field} must contain identifiers.`);
  return value as string[];
}

function deterministicCommandId(agencyId: string, key: string, kind: string): string {
  return createHash('sha256').update(`${agencyId}|${key}|${kind}`).digest('hex').slice(0, 32);
}

const controlledResources = new Set(['import-jobs', 'deliveries', 'maintenance-items', 'comparison-runs', 'service-orders', 'field-attendances', 'evidence-packs', 'portfolio-audits']);
const initialStatus: Record<string, string> = {
  'import-jobs': 'queued', deliveries: 'draft', 'maintenance-items': 'candidate', 'comparison-runs': 'queued',
  'service-orders': 'requested', 'field-attendances': 'scheduled', 'evidence-packs': 'requested', 'portfolio-audits': 'queued',
};

function commandStatus(resource: string, action: string): string {
  const commands: Record<string, Record<string, string>> = {
    'import-jobs': { extract: 'extracting', map: 'mapping', review: 'review_required', confirm: 'confirmed', retry: 'queued', fail: 'failed' },
    deliveries: { queue: 'queued', 'mark-sent': 'sent', 'mark-opened': 'opened', 'mark-downloaded': 'downloaded', revoke: 'revoked', expire: 'expired', retry: 'queued', fail: 'failed' },
    'maintenance-items': { approve: 'approved', 'await-owner': 'awaiting_owner', assign: 'assigned', start: 'in_progress', complete: 'completed', verify: 'verified', close: 'closed', defer: 'deferred', cancel: 'cancelled' },
    'comparison-runs': { start: 'matching', 'complete-matching': 'suggestions_ready', review: 'review_in_progress', approve: 'approved', retry: 'queued', fail: 'failed' },
    'service-orders': { triage: 'triaged', assign: 'assigned', start: 'in_progress', 'submit-quality': 'quality_review', complete: 'completed', rework: 'in_progress', retry: 'assigned', fail: 'failed', cancel: 'cancelled' },
    'field-attendances': { travel: 'travelling', arrive: 'arrived', complete: 'completed', 'no-access': 'no_access', unsafe: 'unsafe', cancel: 'cancelled' },
    'evidence-packs': { approve: 'approved', generate: 'assembling', ready: 'ready', revoke: 'revoked', expire: 'expired', retry: 'approved', fail: 'failed' },
    'portfolio-audits': { start: 'processing', review: 'review_required', approve: 'approved', issue: 'issued', retry: 'queued', fail: 'failed' },
  };
  const status = commands[resource]?.[action];
  if (!status) throw new ApiError(404, 'COMMAND_NOT_FOUND', `Command ${action} is not available for ${resource}.`);
  return status;
}

function serviceTransition(resource: string, existing: Record<string, unknown>, action: string, body: Record<string, unknown>, actorId: string): Record<string, unknown> {
  const status = commandStatus(resource, action);
  if (resource === 'maintenance-items') return transitionMaintenance(existing as unknown as MaintenanceItemRecord, status as MaintenanceItemRecord['status'], optionalStringArray(body.evidenceIds, 'evidenceIds')) as unknown as Record<string, unknown>;
  if (resource === 'import-jobs') return transitionImport(existing as unknown as ImportJobRecord, status as ImportJobRecord['status'], Number(body.acceptedCandidateCount ?? 0)) as unknown as Record<string, unknown>;
  if (resource === 'deliveries') return transitionDelivery(existing as unknown as DeliveryPackageRecord, status as DeliveryPackageRecord['status']) as unknown as Record<string, unknown>;
  if (resource === 'comparison-runs') return transitionComparison(existing as unknown as ComparisonRunRecord, status as ComparisonRunRecord['status'], Number(body.pendingReviewCount ?? 0)) as unknown as Record<string, unknown>;
  if (resource === 'service-orders') return transitionServiceOrder(existing as unknown as ServiceOrderRecord, status as ServiceOrderRecord['status'], actorId) as unknown as Record<string, unknown>;
  if (resource === 'field-attendances') return transitionFieldAttendance(existing as unknown as FieldAttendanceRecord, status as FieldAttendanceRecord['status'], typeof body.outcomeCode === 'string' ? body.outcomeCode : undefined) as unknown as Record<string, unknown>;
  if (resource === 'evidence-packs') return transitionEvidencePack(existing as unknown as EvidencePackRecord, status as EvidencePackRecord['status']) as unknown as Record<string, unknown>;
  if (resource === 'portfolio-audits') return transitionPortfolioAudit(existing as unknown as PortfolioAuditRunRecord, status as PortfolioAuditRunRecord['status'], actorId) as unknown as Record<string, unknown>;
  throw new ApiError(404, 'COMMAND_NOT_FOUND', 'Unsupported service command.');
}

export async function routeApiRequest(
  req: IncomingMessage,
  _res: ServerResponse,
  dependencies: ApiDependencies,
  correlationId: string,
): Promise<ApiResponse | undefined> {
  const parts = routeParts(req.url);
  if (parts[0] !== 'api' || parts[1] !== 'v1') return undefined;
  const resourceName = parts[2];
  if (!resourceName) return { status: 200, body: { name: 'Property Condition Report API', version: 'v1', documentation: '/api/v1/openapi.json' } };
  if (resourceName === 'openapi.json') return undefined;
  const policy = ROUTE_POLICIES[resourceName];
  if (!policy) throw new ApiError(404, 'NOT_FOUND', 'Route not found.');

  const agencyId = agencyHeader(req);
  const id = parts[3];
  const command = parts[4];
  const action = parts[5];
  const body = req.method === 'GET' ? {} : await readJson(req);
  const targetBody = { ...body, agencyId };

  if (req.method === 'POST' && resourceName === 'inspection-jobs' && id === 'commands' && command === 'book') {
    const propertyId = requiredText(body, 'propertyId');
    const inspectionType = requiredText(body, 'inspectionType');
    const templateId = requiredText(body, 'templateId');
    const templateVersion = Number(body.templateVersion);
    const scheduledAt = requiredText(body, 'scheduledAt');
    if (!['entry', 'routine', 'exit'].includes(inspectionType)) throw new ApiError(400, 'VALIDATION_ERROR', 'inspectionType must be entry, routine or exit.');
    if (!Number.isInteger(templateVersion) || templateVersion < 1) throw new ApiError(400, 'VALIDATION_ERROR', 'templateVersion must be a positive integer.');
    if (Number.isNaN(Date.parse(scheduledAt))) throw new ApiError(400, 'VALIDATION_ERROR', 'scheduledAt must be an ISO date-time.');
    const property = await dependencies.repository.get('properties', agencyId, propertyId);
    if (!property) throw new ApiError(404, 'PROPERTY_NOT_FOUND', 'Property not found in this agency.');
    const tenancyId = typeof body.tenancyId === 'string' && body.tenancyId.trim() ? body.tenancyId.trim() : undefined;
    if (tenancyId) {
      const tenancy = await dependencies.repository.get('tenancies', agencyId, tenancyId);
      if (!tenancy || tenancy.propertyId !== propertyId) throw new ApiError(409, 'TENANCY_PROPERTY_MISMATCH', 'Tenancy does not belong to the selected property.');
    }
    const template = WA_RESIDENTIAL_V1_TEMPLATES.find((candidate) => candidate.id === templateId && candidate.version === templateVersion);
    if (!template || template.status !== 'published' || template.inspectionType !== inspectionType) throw new ApiError(409, 'PUBLISHED_TEMPLATE_REQUIRED', 'A compatible published template version is required.');
    const sourceReportIds = optionalStringArray(body.sourceReportIds, 'sourceReportIds');
    const baselineVersionIds = optionalStringArray(body.baselineVersionIds, 'baselineVersionIds');
    if (inspectionType === 'exit' && (!sourceReportIds.length || !baselineVersionIds.length)) throw new ApiError(409, 'ENTRY_BASELINE_REQUIRED', 'Exit booking requires an Entry source report and immutable baseline version.');
    const inspectorId = typeof body.assignedInspectorId === 'string' && body.assignedInspectorId.trim() ? body.assignedInspectorId.trim() : undefined;
    const reviewerId = typeof body.assignedReviewerId === 'string' && body.assignedReviewerId.trim() ? body.assignedReviewerId.trim() : undefined;
    for (const [userId, expectedRole] of [[inspectorId, 'inspector'], [reviewerId, 'reviewer']] as const) {
      if (!userId) continue;
      const user = await dependencies.repository.get('users', agencyId, userId);
      if (!user || user.role !== expectedRole || user.status !== 'active') throw new ApiError(409, 'ASSIGNEE_ROLE_INVALID', `Assigned ${expectedRole} is not an active ${expectedRole}.`);
    }
    const key = idempotencyKey(req);
    const expectedJobId = deterministicCommandId(agencyId, key, 'job');
    const active = await dependencies.repository.list('inspectionJobs', agencyId, 100);
    const conflict = active.items.find((job) => job.id !== expectedJobId && job.propertyId === propertyId && !['finalised', 'archived', 'cancelled'].includes(String(job.status)) && job.scheduledAt === scheduledAt);
    if (conflict) throw new ApiError(409, 'ACTIVE_JOB_CONFLICT', 'A conflicting active inspection job already exists.', { conflictingJobId: conflict.id });
    const principal = await authenticateAndAuthorise(req, dependencies, 'job.manage', { agencyId, propertyId, ...(tenancyId ? { tenancyId } : {}) }, correlationId);
    return idempotent(dependencies, req, agencyId, 'inspection-jobs:book', body, async () => {
      const jobId = deterministicCommandId(agencyId, key, 'job');
      const reportId = deterministicCommandId(agencyId, key, 'report');
      const assignmentId = deterministicCommandId(agencyId, key, 'assignment');
      const timestamp = new Date().toISOString();
      let report = await dependencies.reports.load(agencyId, reportId);
      if (!report) {
        report = await dependencies.reports.saveDraft(materialisePublishedTemplate(template, {
          agencyId, reportId, inspectionJobId: jobId, propertyId, propertyAddress: String(property.address),
          ...(tenancyId ? { tenancyId } : {}), ...(inspectorId ? { assignedInspectorId: inspectorId } : {}),
          ...(reviewerId ? { assignedReviewerId: reviewerId } : {}), assignedAt: timestamp, assignedBy: principal.uid,
          ...(sourceReportIds.length ? { sourceReportIds } : {}), ...(baselineVersionIds.length ? { baselineVersionIds } : {}),
        }), undefined, principal.uid);
      }
      let job = await dependencies.repository.get('inspectionJobs', agencyId, jobId);
      if (!job) job = await dependencies.repository.create('inspectionJobs', agencyId, jobId, {
        propertyId, ...(tenancyId ? { tenancyId } : {}), reportId, reportType: report.report.reportType,
        inspectionType, scheduledAt, ...(inspectorId ? { assignedInspectorId: inspectorId } : {}),
        ...(reviewerId ? { assignedReviewerId: reviewerId } : {}), status: inspectorId ? 'assigned' : 'booked',
        bookingSagaStatus: 'materialised', templateId, templateVersion,
      }, principal.uid);
      if (!await dependencies.repository.get('reportTemplateAssignments', agencyId, assignmentId)) {
        await dependencies.repository.create('reportTemplateAssignments', agencyId, assignmentId, {
          reportId, jobId, templateId, templateVersion, templateHash: template.contentHash,
          assignedAt: timestamp, assignedBy: principal.uid, immutable: true,
        }, principal.uid);
      }
      if (!await dependencies.repository.get('assignmentHistory', agencyId, assignmentId)) {
        await dependencies.repository.create('assignmentHistory', agencyId, assignmentId, {
          inspectionJobId: jobId, reportId, assignedInspectorId: inspectorId ?? null,
          assignedReviewerId: reviewerId ?? null, effectiveAt: timestamp, reason: 'initial_booking',
        }, principal.uid);
      }
      const eventId = deterministicCommandId(agencyId, key, 'event');
      if (!await dependencies.repository.get('outboxEvents', agencyId, eventId)) {
        await dependencies.repository.create('outboxEvents', agencyId, eventId, {
          eventType: 'inspection_job.booked', aggregateType: 'inspection_job', aggregateId: jobId,
          aggregateVersion: job.version, payload: { jobId, reportId, propertyId, templateId, templateVersion },
          correlationId, status: 'pending', attempt: 0, availableAt: timestamp,
        }, principal.uid);
      }
      await appendMaterialAudit(dependencies, principal, 'job.manage', 'inspection_jobs.book', correlationId, { ...job, reportId });
      return { status: 201, body: { data: { jobId, reportId, assignmentId, jobVersion: job.version, reportVersion: report.report.version, workspaceRevision: report.report.workspaceRevision }, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && id && command === 'commands' && action && controlledResources.has(resourceName)) {
    const existing = await dependencies.repository.get(policy.collection, agencyId, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
    const writeCapability = policy.writeCapability;
    if (!writeCapability) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This resource is read-only.');
    const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target({ ...existing, agencyId }, id), correlationId);
    const version = expectedVersion(body);
    if (existing.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'The record has changed. Reload and retry.', { expectedVersion: version, actualVersion: existing.version });
    const key = idempotencyKey(req);
    return idempotent(dependencies, req, agencyId, `${resourceName}:${id}:commands:${action}`, body, async () => {
      const transitioned = serviceTransition(resourceName, existing, action, body, principal.uid);
      const systemFields = new Set(['id', 'agencyId', 'version', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);
      const patch = Object.fromEntries(Object.entries(transitioned).filter(([field]) => !systemFields.has(field)));
      const updated = await dependencies.repository.update(policy.collection, agencyId, id, patch, version, principal.uid);
      const eventId = deterministicCommandId(agencyId, key, `${resourceName}:${id}:${action}:event`);
      if (!await dependencies.repository.get('outboxEvents', agencyId, eventId)) {
        await dependencies.repository.create('outboxEvents', agencyId, eventId, {
          eventType: `${resourceName.replace(/-/gu, '_')}.${action.replace(/-/gu, '_')}`, aggregateType: resourceName,
          aggregateId: id, aggregateVersion: updated.version, payload: { id, status: updated.status }, correlationId,
          status: 'pending', attempt: 0, availableAt: new Date().toISOString(),
        }, principal.uid);
      }
      if (resourceName === 'evidence-packs' && action === 'generate') await dependencies.tasks.dispatch('evidence_pack', agencyId, id, updated);
      if (resourceName === 'portfolio-audits' && action === 'start') await dependencies.tasks.dispatch('portfolio_audit', agencyId, id, updated);
      if (resourceName === 'import-jobs' && ['extract', 'retry'].includes(action)) await dependencies.tasks.dispatch('import', agencyId, id, updated);
      await appendMaterialAudit(dependencies, principal, writeCapability, `${resourceName}.${action}`, correlationId, updated);
      return { status: action === 'generate' || action === 'start' || action === 'extract' ? 202 : 200, body: { data: updated, meta: { correlationId } } };
    });
  }

  if (req.method === 'GET') {
    if (id) {
      const record = await dependencies.repository.get(policy.collection, agencyId, id);
      if (!record) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
      const principal = await authenticateAndAuthorise(req, dependencies, policy.readCapability, policy.target({ ...record, agencyId }, id), correlationId);
      return { status: 200, body: { data: record, meta: { correlationId, actor: principal.uid } } };
    }
    const principal = await authenticateAndAuthorise(req, dependencies, policy.readCapability, policy.target({ agencyId }), correlationId);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 100);
    const page = await dependencies.repository.list(policy.collection, agencyId, limit, url.searchParams.get('cursor') ?? undefined);
    return { status: 200, body: { data: page.items, meta: { correlationId, actor: principal.uid, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) } } };
  }

  const writeCapability = policy.writeCapability;
  if (!writeCapability) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This resource is read-only.');

  if (req.method === 'POST' && command === 'transitions' && id) {
    if (controlledResources.has(resourceName)) throw new ApiError(410, 'GENERIC_TRANSITION_DISABLED', 'Use a named command for this workflow.');
    const transition = validation(workflowTransitionSchema.parse(body));
    const existing = await dependencies.repository.get(policy.collection, agencyId, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target({ ...existing, agencyId }, id), correlationId);
    return idempotent(dependencies, req, agencyId, `${resourceName}:${id}:transition`, body, async () => {
      const field = resourceName === 'reports' ? 'lifecycleStatus' : 'status';
      const updated = await dependencies.repository.update(
        policy.collection,
        agencyId,
        id,
        { [field]: transition.status, ...(transition.reason ? { transitionReason: transition.reason } : {}) },
        transition.expectedVersion,
        principal.uid,
      );
      await appendMaterialAudit(dependencies, principal, writeCapability, `${resourceName}.transition`, correlationId, updated);
      return { status: 200, body: { data: updated, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && resourceName === 'uploads') {
    if (id && command === 'complete') {
      const existing = await dependencies.repository.get(policy.collection, agencyId, id);
      if (!existing) throw new ApiError(404, 'UPLOAD_SESSION_NOT_FOUND', 'Upload session not found.');
      const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target({ ...existing, agencyId }, id), correlationId);
      return idempotent(dependencies, req, agencyId, `uploads:${id}:complete`, body, async () => {
        const evidence = await dependencies.uploads.complete(agencyId, id, body, principal);
        await appendMaterialAudit(dependencies, principal, writeCapability, 'uploads.complete', correlationId, evidence);
        return { status: 200, body: { data: evidence, meta: { correlationId } } };
      });
    }
    const input = validation(uploadSessionSchema.parse(body));
    const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target({ ...input, agencyId }), correlationId);
    return idempotent(dependencies, req, agencyId, 'uploads.create', body, async () => {
      const uploadId = randomUUID();
      const session = await dependencies.uploads.create(agencyId, uploadId, input as unknown as Record<string, unknown>, principal);
      const stored = await dependencies.repository.create(policy.collection, agencyId, uploadId, session, principal.uid);
      await appendMaterialAudit(dependencies, principal, writeCapability, 'uploads.create', correlationId, stored);
      return { status: 201, body: { data: stored, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && (resourceName === 'analysis-jobs' || resourceName === 'pdf-jobs' || resourceName === 'notifications')) {
    const input = resourceName === 'notifications' ? validation(resourceWriteSchema.parse(body)) : validation(taskCreationSchema.parse(body));
    const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target({ ...input, agencyId }), correlationId);
    return idempotent(dependencies, req, agencyId, `${resourceName}.create`, body, async () => {
      const taskId = randomUUID();
      const data = { ...input, status: 'queued', queuedAt: new Date().toISOString() } as Record<string, unknown>;
      const stored = await dependencies.repository.create(policy.collection, agencyId, taskId, data, principal.uid);
      const kind = resourceName === 'analysis-jobs' ? 'analysis' : resourceName === 'pdf-jobs' ? 'pdf' : 'notification';
      await dependencies.tasks.dispatch(kind, agencyId, taskId, data);
      await appendMaterialAudit(dependencies, principal, writeCapability, `${resourceName}.create`, correlationId, stored);
      return { status: 202, body: { data: stored, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && resourceName === 'tenant-responses') {
    const input = validation(tenantResponseSchema.parse(body));
    const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target({ ...input, agencyId }), correlationId);
    return idempotent(dependencies, req, agencyId, 'tenant-responses.submit', body, async () => {
      const responseId = randomUUID();
      const stored = await dependencies.repository.create(policy.collection, agencyId, responseId, { ...input, status: 'submitted', submittedAt: new Date().toISOString() }, principal.uid);
      await appendMaterialAudit(dependencies, principal, writeCapability, 'tenant-responses.submit', correlationId, stored);
      return { status: 201, body: { data: stored, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && !id) {
    const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target(targetBody), correlationId);
    return idempotent(dependencies, req, agencyId, `${resourceName}.create`, body, async () => {
      const recordId = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : randomUUID();
      const data = writeBody(body);
      if (controlledResources.has(resourceName)) {
        if (typeof data.status === 'string' && data.status !== initialStatus[resourceName]) throw new ApiError(409, 'INITIAL_STATUS_INVALID', `New ${resourceName} records must start in ${initialStatus[resourceName]}.`);
        data.status = initialStatus[resourceName];
      }
      const stored = await dependencies.repository.create(policy.collection, agencyId, recordId, data, principal.uid);
      await appendMaterialAudit(dependencies, principal, writeCapability, `${resourceName}.create`, correlationId, stored);
      return { status: 201, body: { data: stored, meta: { correlationId } } };
    });
  }

  if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
    const existing = await dependencies.repository.get(policy.collection, agencyId, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Record not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, writeCapability, policy.target({ ...existing, ...targetBody }, id), correlationId);
    if (controlledResources.has(resourceName) && 'status' in body) throw new ApiError(409, 'COMMAND_REQUIRED', 'Lifecycle status can only be changed through a named command.');
    return idempotent(dependencies, req, agencyId, `${resourceName}:${id}.update`, body, async () => {
      const stored = await dependencies.repository.update(policy.collection, agencyId, id, writeBody(body), expectedVersion(body), principal.uid);
      await appendMaterialAudit(dependencies, principal, writeCapability, `${resourceName}.update`, correlationId, stored);
      return { status: 200, body: { data: stored, meta: { correlationId } } };
    });
  }

  throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed for this route.');
}
