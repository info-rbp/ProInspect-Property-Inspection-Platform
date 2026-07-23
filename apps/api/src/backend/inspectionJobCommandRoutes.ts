import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  transitionInspectionJob,
  type InspectionJobStatus,
  type SecurityCapability,
  type UserRole,
} from '@pcr/domain';
import {
  materialisePublishedTemplate,
  type InspectionTypeTemplate,
} from '@pcr/templates';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import type { ApiResponse } from './router.js';
import type { ApiDependencies, IdempotencyResult } from './types.js';

class JobCommandError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 1_000_000) throw new JobCommandError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new JobCommandError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new JobCommandError(400, 'VALIDATION_ERROR', `${field} is required.`);
  return value.trim();
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new JobCommandError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a positive integer.');
  }
  return value;
}

function idempotencyKey(req: IncomingMessage): string {
  const value = req.headers['idempotency-key']?.toString().trim();
  if (!value || value.length < 8 || value.length > 200) {
    throw new JobCommandError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required.');
  }
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deterministicId(agencyId: string, key: string, kind: string): string {
  return createHash('sha256').update(`${agencyId}|${key}|${kind}`).digest('hex').slice(0, 32);
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new JobCommandError(400, 'VALIDATION_ERROR', `${field} must contain identifiers.`);
  }
  return value.map((item) => String(item).trim());
}

async function idempotent(
  dependencies: ApiDependencies,
  req: IncomingMessage,
  agencyId: string,
  operation: string,
  body: Record<string, unknown>,
  action: () => Promise<IdempotencyResult>,
): Promise<ApiResponse> {
  const execution = await dependencies.idempotency.execute(
    agencyId,
    operation,
    idempotencyKey(req),
    hash(body),
    action,
  );
  return {
    status: execution.result.status,
    body: execution.result.body,
    headers: { 'idempotency-replayed': String(execution.replayed) },
  };
}

async function audit(
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
      ...(typeof target.id === 'string' ? { inspectionJobId: target.id } : {}),
      ...(typeof target.reportId === 'string' ? { reportId: target.reportId } : {}),
    },
    correlationId,
  });
}

async function resolveTemplate(
  dependencies: ApiDependencies,
  agencyId: string,
  actorId: string,
  templateId: string,
  templateVersion: number,
): Promise<InspectionTypeTemplate | undefined> {
  const preset = WA_RESIDENTIAL_V1_TEMPLATES.find(
    (candidate) => candidate.id === templateId && candidate.version === templateVersion,
  );
  if (preset) return preset;
  return dependencies.templateRepository?.(agencyId, actorId).get(templateId, templateVersion);
}

function commandTarget(action: string, body: Record<string, unknown>, current: InspectionJobStatus): InspectionJobStatus {
  const targets: Record<string, InspectionJobStatus> = {
    assign: 'assigned',
    'start-inspection': 'inspection_started',
    'begin-photo-upload': 'photos_uploading',
    'complete-photo-upload': 'photos_uploaded',
    'submit-fieldwork': 'inspection_submitted',
    hold: 'on_hold',
    'record-no-access': 'on_hold',
    'record-unsafe': 'on_hold',
    cancel: 'cancelled',
    reopen: 'draft',
  };
  if (action === 'resume') {
    const requested = text(body.resumeStatus, 'resumeStatus') as InspectionJobStatus;
    const permitted: InspectionJobStatus[] = [
      'assigned', 'inspection_started', 'photos_uploading', 'photos_uploaded', 'inspection_submitted',
      'analysis_queued', 'analyst_review_in_progress', 'review_required', 'ready_to_issue',
      'issued_to_tenant', 'finalisation_ready',
    ];
    if (!permitted.includes(requested)) throw new JobCommandError(400, 'RESUME_STATUS_INVALID', 'resumeStatus is not permitted.');
    return requested;
  }
  const target = targets[action];
  if (!target) throw new JobCommandError(404, 'COMMAND_NOT_FOUND', `Unknown inspection-job command: ${action}.`);
  if (action === 'assign' && current === 'assigned') return 'assigned';
  return target;
}

function gateContext(report: Awaited<ReturnType<ApiDependencies['reports']['load']>>) {
  const metadata = report?.report;
  const qualityReady = metadata?.qualityStatus === 'ready' || metadata?.qualityStatus === 'waived';
  return {
    requiredEvidenceComplete: qualityReady,
    requiredComponentsComplete: qualityReady,
    templateVersionAssigned: Boolean(metadata?.templateId && metadata.templateVersion && metadata.templateHash),
    analysisComplete: Boolean(metadata && ['analysis_complete', 'internal_review', 'review_required', 'changes_requested', 'approved_for_issue', 'issued_to_tenant', 'tenant_response_in_progress', 'tenant_submitted', 'agent_response_required', 'finalisation_ready', 'finalised', 'archived'].includes(metadata.lifecycleStatus)),
    analystApproved: Boolean(metadata?.analystApprovedAt),
    reviewerApproved: Boolean(metadata?.reviewerApprovedAt),
    tenantResponseResolved: metadata?.tenantReviewPolicy === 'disabled' || Boolean(metadata?.tenantResponseResolvedAt),
    finalPdfCreated: Boolean(metadata?.pdfReference),
    archiveCreated: Boolean(metadata?.archiveReference),
  };
}

export async function routeInspectionJobCommandRequest(
  req: IncomingMessage,
  dependencies: ApiDependencies,
  correlationId: string,
  agencyId: string,
  path: string[],
): Promise<ApiResponse | undefined> {
  if (path[0] === 'commands' && path[1] === 'book' && req.method === 'POST') {
    const body = await readJson(req);
    const propertyId = text(body.propertyId, 'propertyId');
    const inspectionType = text(body.inspectionType, 'inspectionType');
    const templateId = text(body.templateId, 'templateId');
    const templateVersion = Number(body.templateVersion);
    const scheduledAt = text(body.scheduledAt, 'scheduledAt');
    if (!['entry', 'routine', 'exit'].includes(inspectionType)) throw new JobCommandError(400, 'VALIDATION_ERROR', 'inspectionType must be entry, routine or exit.');
    if (!Number.isInteger(templateVersion) || templateVersion < 1) throw new JobCommandError(400, 'VALIDATION_ERROR', 'templateVersion must be a positive integer.');
    if (Number.isNaN(Date.parse(scheduledAt))) throw new JobCommandError(400, 'VALIDATION_ERROR', 'scheduledAt must be an ISO date-time.');
    const property = await dependencies.repository.get('properties', agencyId, propertyId);
    if (!property) throw new JobCommandError(404, 'PROPERTY_NOT_FOUND', 'Property not found in this agency.');
    const tenancyId = typeof body.tenancyId === 'string' && body.tenancyId.trim() ? body.tenancyId.trim() : undefined;
    if (tenancyId) {
      const tenancy = await dependencies.repository.get('tenancies', agencyId, tenancyId);
      if (!tenancy || tenancy.propertyId !== propertyId) throw new JobCommandError(409, 'TENANCY_PROPERTY_MISMATCH', 'Tenancy does not belong to the selected property.');
    }
    const principal = await authenticateAndAuthorise(req, dependencies, 'job.manage', { agencyId, propertyId, ...(tenancyId ? { tenancyId } : {}) }, correlationId);
    const template = await resolveTemplate(dependencies, agencyId, principal.uid, templateId, templateVersion);
    if (!template || template.status !== 'published' || template.inspectionType !== inspectionType) {
      throw new JobCommandError(409, 'PUBLISHED_TEMPLATE_REQUIRED', 'A compatible published template version is required.');
    }
    const sourceReportIds = stringArray(body.sourceReportIds, 'sourceReportIds');
    const baselineVersionIds = stringArray(body.baselineVersionIds, 'baselineVersionIds');
    if (inspectionType === 'exit' && (!sourceReportIds.length || !baselineVersionIds.length)) {
      throw new JobCommandError(409, 'ENTRY_BASELINE_REQUIRED', 'Exit booking requires an Entry source report and immutable baseline version.');
    }
    const inspectorId = typeof body.assignedInspectorId === 'string' && body.assignedInspectorId.trim() ? body.assignedInspectorId.trim() : undefined;
    const reviewerId = typeof body.assignedReviewerId === 'string' && body.assignedReviewerId.trim() ? body.assignedReviewerId.trim() : undefined;
    for (const [userId, role] of [[inspectorId, 'inspector'], [reviewerId, 'reviewer']] as const) {
      if (!userId) continue;
      const user = await dependencies.repository.get('users', agencyId, userId);
      if (!user || user.role !== role || user.status !== 'active') throw new JobCommandError(409, 'ASSIGNEE_ROLE_INVALID', `Assigned ${role} is not an active ${role}.`);
    }
    const key = idempotencyKey(req);
    const expectedJobId = deterministicId(agencyId, key, 'job');
    const active = await dependencies.repository.list('inspectionJobs', agencyId, 100);
    const conflict = active.items.find((job) => job.id !== expectedJobId && job.propertyId === propertyId && job.scheduledAt === scheduledAt && !['finalised', 'archived', 'cancelled'].includes(String(job.status)));
    if (conflict) throw new JobCommandError(409, 'ACTIVE_JOB_CONFLICT', 'A conflicting active inspection job already exists.', { conflictingJobId: conflict.id });

    return idempotent(dependencies, req, agencyId, 'inspection-jobs:book:v2', body, async () => {
      const jobId = deterministicId(agencyId, key, 'job');
      const reportId = deterministicId(agencyId, key, 'report');
      const assignmentId = deterministicId(agencyId, key, 'assignment');
      const timestamp = new Date().toISOString();
      let report = await dependencies.reports.load(agencyId, reportId);
      if (!report) {
        report = await dependencies.reports.saveDraft(materialisePublishedTemplate(template, {
          agencyId,
          reportId,
          inspectionJobId: jobId,
          propertyId,
          propertyAddress: String(property.address),
          ...(tenancyId ? { tenancyId } : {}),
          ...(inspectorId ? { assignedInspectorId: inspectorId } : {}),
          ...(reviewerId ? { assignedReviewerId: reviewerId } : {}),
          assignedAt: timestamp,
          assignedBy: principal.uid,
          ...(sourceReportIds.length ? { sourceReportIds } : {}),
          ...(baselineVersionIds.length ? { baselineVersionIds } : {}),
        }), undefined, principal.uid);
      }
      let job = await dependencies.repository.get('inspectionJobs', agencyId, jobId);
      if (!job) {
        job = await dependencies.repository.create('inspectionJobs', agencyId, jobId, {
          propertyId,
          ...(tenancyId ? { tenancyId } : {}),
          reportId,
          reportType: report.report.reportType,
          inspectionType,
          scheduledAt,
          ...(inspectorId ? { assignedInspectorId: inspectorId } : {}),
          ...(reviewerId ? { assignedReviewerId: reviewerId } : {}),
          status: inspectorId ? 'assigned' : 'booked',
          bookingSagaStatus: 'materialised',
          templateId,
          templateVersion,
          accessInstructions: body.accessInstructions ?? null,
        }, principal.uid);
      }
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
      const eventId = deterministicId(agencyId, key, 'event');
      if (!await dependencies.repository.get('outboxEvents', agencyId, eventId)) {
        await dependencies.repository.create('outboxEvents', agencyId, eventId, {
          eventType: 'inspection_job.booked', aggregateType: 'inspection_job', aggregateId: jobId,
          aggregateVersion: job.version, payload: { jobId, reportId, propertyId, templateId, templateVersion },
          correlationId, status: 'pending', attempt: 0, availableAt: timestamp,
        }, principal.uid);
      }
      await audit(dependencies, principal, 'job.manage', 'inspection_jobs.book', correlationId, { ...job, reportId });
      return {
        status: 201,
        body: {
          data: {
            jobId,
            reportId,
            assignmentId,
            jobVersion: job.version,
            reportVersion: report.report.version,
            workspaceRevision: report.report.workspaceRevision,
          },
          meta: { correlationId },
        },
      };
    });
  }

  const jobId = path[0];
  if (!jobId) return undefined;
  if (path[1] === 'transitions') {
    throw new JobCommandError(410, 'GENERIC_TRANSITION_DISABLED', 'Use a named inspection-job command.');
  }
  if (path[1] !== 'commands' || !path[2] || req.method !== 'POST') return undefined;

  const action = path[2];
  const body = await readJson(req);
  const current = await dependencies.repository.get('inspectionJobs', agencyId, jobId);
  if (!current) throw new JobCommandError(404, 'NOT_FOUND', 'Inspection job not found.');
  const expectedVersion = version(body.expectedVersion);
  if (current.version !== expectedVersion) throw new JobCommandError(409, 'VERSION_CONFLICT', 'The inspection job has changed. Reload and retry.', { expectedVersion, actualVersion: current.version });
  const principal = await authenticateAndAuthorise(req, dependencies, 'job.manage', {
    agencyId,
    propertyId: current.propertyId as string,
    ...(typeof current.tenancyId === 'string' ? { tenancyId: current.tenancyId } : {}),
    inspectionJobId: jobId,
    ...(typeof current.assignedInspectorId === 'string' ? { assignedInspectorId: current.assignedInspectorId } : {}),
  }, correlationId);

  return idempotent(dependencies, req, agencyId, `inspection-jobs:${jobId}:commands:${action}`, body, async () => {
    if (action === 'reschedule') {
      const scheduledAt = text(body.scheduledAt, 'scheduledAt');
      if (Number.isNaN(Date.parse(scheduledAt))) throw new JobCommandError(400, 'VALIDATION_ERROR', 'scheduledAt must be an ISO date-time.');
      const updated = await dependencies.repository.update('inspectionJobs', agencyId, jobId, {
        scheduledAt,
        rescheduleReason: text(body.reason, 'reason'),
      }, expectedVersion, principal.uid);
      await audit(dependencies, principal, 'job.manage', 'inspection_jobs.reschedule', correlationId, updated);
      return { status: 200, body: { data: updated, meta: { correlationId } } };
    }

    if (action === 'reassign') {
      const inspectorId = typeof body.assignedInspectorId === 'string' && body.assignedInspectorId.trim() ? body.assignedInspectorId.trim() : undefined;
      const reviewerId = typeof body.assignedReviewerId === 'string' && body.assignedReviewerId.trim() ? body.assignedReviewerId.trim() : undefined;
      if (!inspectorId && !reviewerId) throw new JobCommandError(400, 'VALIDATION_ERROR', 'At least one assignee is required.');
      for (const [userId, role] of [[inspectorId, 'inspector'], [reviewerId, 'reviewer']] as const) {
        if (!userId) continue;
        const user = await dependencies.repository.get('users', agencyId, userId);
        if (!user || user.role !== role || user.status !== 'active') throw new JobCommandError(409, 'ASSIGNEE_ROLE_INVALID', `Assigned ${role} is not an active ${role}.`);
      }
      const updated = await dependencies.repository.update('inspectionJobs', agencyId, jobId, {
        ...(inspectorId ? { assignedInspectorId: inspectorId } : {}),
        ...(reviewerId ? { assignedReviewerId: reviewerId } : {}),
        assignmentReason: text(body.reason, 'reason'),
      }, expectedVersion, principal.uid);
      await audit(dependencies, principal, 'job.manage', 'inspection_jobs.reassign', correlationId, updated);
      return { status: 200, body: { data: updated, meta: { correlationId } } };
    }

    const target = commandTarget(action, body, String(current.status) as InspectionJobStatus);
    const report = typeof current.reportId === 'string' ? await dependencies.reports.load(agencyId, current.reportId) : undefined;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : action === 'record-no-access' ? 'Access was not available.' : action === 'record-unsafe' ? 'Inspection stopped because the site was unsafe.' : undefined;
    const event = transitionInspectionJob({
      entityId: jobId,
      current: String(current.status) as InspectionJobStatus,
      requested: target,
      currentVersion: Number(current.version),
      expectedVersion,
      actorId: principal.uid,
      actorRole: principal.role as UserRole,
      correlationId,
      context: gateContext(report),
      ...(reason ? { reason } : {}),
    });
    const updated = await dependencies.repository.update('inspectionJobs', agencyId, jobId, {
      status: event.to,
      transitionReason: event.reason ?? null,
      ...(action === 'assign' && typeof body.assignedInspectorId === 'string' ? { assignedInspectorId: body.assignedInspectorId } : {}),
      ...(action === 'record-no-access' ? { attendanceOutcome: 'no_access' } : {}),
      ...(action === 'record-unsafe' ? { attendanceOutcome: 'unsafe' } : {}),
    }, expectedVersion, principal.uid);
    const eventId = randomUUID();
    await dependencies.repository.create('outboxEvents', agencyId, eventId, {
      eventType: `inspection_job.${action.replaceAll('-', '_')}`,
      aggregateType: 'inspection_job', aggregateId: jobId, aggregateVersion: updated.version,
      payload: { jobId, status: updated.status, reportId: current.reportId ?? null },
      correlationId, status: 'pending', attempt: 0, availableAt: new Date().toISOString(),
    }, principal.uid);
    await audit(dependencies, principal, 'job.manage', `inspection_jobs.${action}`, correlationId, updated);
    return { status: 200, body: { data: updated, meta: { correlationId } } };
  });
}
