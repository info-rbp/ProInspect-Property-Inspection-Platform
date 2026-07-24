import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  EXCEPTIONAL_REPORT_REASON_CODES,
  type ExceptionalReportReasonCode,
  type ReportOrigin,
} from '@pcr/domain';
import {
  materialiseExceptionalReport,
  type InspectionTypeTemplate,
} from '@pcr/templates';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import type { ApiResponse } from './router.js';
import type { ApiDependencies, IdempotencyResult } from './types.js';

class ExceptionalReportError extends Error {
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
    if (length > 1_000_000) throw new ExceptionalReportError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new ExceptionalReportError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ExceptionalReportError(400, 'VALIDATION_ERROR', `${field} is required.`);
  return value.trim();
}

function stringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new ExceptionalReportError(400, 'VALIDATION_ERROR', `${field} must contain identifiers.`);
  }
  const values = value.map((item) => String(item).trim());
  if (new Set(values).size !== values.length) throw new ExceptionalReportError(400, 'VALIDATION_ERROR', `${field} must contain unique identifiers.`);
  return values;
}

function idempotencyKey(req: IncomingMessage): string {
  const value = req.headers['idempotency-key']?.toString().trim();
  if (!value || value.length < 8 || value.length > 200) throw new ExceptionalReportError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required.');
  return value;
}

function deterministicId(agencyId: string, key: string, kind: string): string {
  return createHash('sha256').update(`${agencyId}|${key}|${kind}`).digest('hex').slice(0, 32);
}

async function resolveTemplate(
  dependencies: ApiDependencies,
  agencyId: string,
  actorId: string,
  templateId: string,
  templateVersion: number,
): Promise<InspectionTypeTemplate | undefined> {
  const preset = WA_RESIDENTIAL_V1_TEMPLATES.find((candidate) => candidate.id === templateId && candidate.version === templateVersion);
  if (preset) return preset;
  return dependencies.templateRepository?.(agencyId, actorId).get(templateId, templateVersion);
}

function origin(reasonCode: ExceptionalReportReasonCode): ReportOrigin {
  if (reasonCode === 'comparison_only') return 'comparison';
  if (reasonCode === 'maintenance_follow_up') return 'maintenance_follow_up';
  return 'exceptional_manual';
}

function assertNotBookingShortcut(reasonCode: ExceptionalReportReasonCode, sourceDocumentIds: string[]): void {
  if (reasonCode === 'historical_manual' && sourceDocumentIds.length === 0) {
    throw new ExceptionalReportError(409, 'SOURCE_DOCUMENT_REQUIRED', 'Historical manual reports require at least one source document. Use the import workflow when structured source material is available.');
  }
}

async function idempotent(
  dependencies: ApiDependencies,
  req: IncomingMessage,
  agencyId: string,
  body: Record<string, unknown>,
  action: () => Promise<IdempotencyResult>,
): Promise<ApiResponse> {
  const execution = await dependencies.idempotency.execute(
    agencyId,
    'reports:create-exceptional',
    idempotencyKey(req),
    createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    action,
  );
  return {
    status: execution.result.status,
    body: execution.result.body,
    headers: { 'idempotency-replayed': String(execution.replayed) },
  };
}

export async function routeExceptionalReportRequest(
  req: IncomingMessage,
  dependencies: ApiDependencies,
  correlationId: string,
  agencyId: string,
  path: string[],
): Promise<ApiResponse | undefined> {
  if (req.method !== 'POST' || path[0] !== 'commands' || path[1] !== 'create-exceptional') return undefined;

  const body = await readJson(req);
  const propertyId = text(body.propertyId, 'propertyId');
  const reportType = text(body.reportType, 'reportType');
  const templateId = text(body.templateId, 'templateId');
  const templateVersion = Number(body.templateVersion);
  const reason = text(body.reason, 'reason');
  const reasonCode = text(body.reasonCode, 'reasonCode') as ExceptionalReportReasonCode;
  if (!EXCEPTIONAL_REPORT_REASON_CODES.includes(reasonCode)) throw new ExceptionalReportError(400, 'VALIDATION_ERROR', 'reasonCode is not supported.');
  if (!Number.isInteger(templateVersion) || templateVersion < 1) throw new ExceptionalReportError(400, 'VALIDATION_ERROR', 'templateVersion must be a positive integer.');

  const sourceReportIds = stringArray(body.sourceReportIds, 'sourceReportIds');
  const sourceDocumentIds = stringArray(body.sourceDocumentIds, 'sourceDocumentIds');
  assertNotBookingShortcut(reasonCode, sourceDocumentIds);

  const property = await dependencies.repository.get('properties', agencyId, propertyId);
  if (!property) throw new ExceptionalReportError(404, 'PROPERTY_NOT_FOUND', 'Property not found in this agency.');
  const tenancyId = typeof body.tenancyId === 'string' && body.tenancyId.trim() ? body.tenancyId.trim() : undefined;
  if (tenancyId) {
    const tenancy = await dependencies.repository.get('tenancies', agencyId, tenancyId);
    if (!tenancy || tenancy.propertyId !== propertyId) throw new ExceptionalReportError(409, 'TENANCY_PROPERTY_MISMATCH', 'Tenancy does not belong to the selected property.');
  }

  const principal = await authenticateAndAuthorise(req, dependencies, 'agency.manage', { agencyId, propertyId, ...(tenancyId ? { tenancyId } : {}) }, correlationId);
  const template = await resolveTemplate(dependencies, agencyId, principal.uid, templateId, templateVersion);
  if (!template || template.status !== 'published' || !template.contentHash) throw new ExceptionalReportError(409, 'PUBLISHED_TEMPLATE_REQUIRED', 'A published, content-addressed template is required.');

  const key = idempotencyKey(req);
  return idempotent(dependencies, req, agencyId, body, async () => {
    const reportId = deterministicId(agencyId, key, 'exceptional-report');
    const assignmentId = deterministicId(agencyId, key, 'exceptional-template-assignment');
    const eventId = deterministicId(agencyId, key, 'exceptional-event');
    const timestamp = new Date().toISOString();

    let aggregate = await dependencies.reports.load(agencyId, reportId);
    if (!aggregate) {
      aggregate = await dependencies.reports.saveDraft(materialiseExceptionalReport(template, {
        agencyId,
        reportId,
        propertyId,
        propertyAddress: String(property.address ?? ''),
        ...(tenancyId ? { tenancyId } : {}),
        assignedAt: timestamp,
        assignedBy: principal.uid,
        origin: origin(reasonCode) as Exclude<ReportOrigin, 'inspection_booking'>,
        reportType,
        reasonCode,
        reason,
        ...(sourceReportIds.length ? { sourceReportIds } : {}),
        ...(sourceDocumentIds.length ? { sourceDocumentIds } : {}),
      }), undefined, principal.uid);
    }

    if (!await dependencies.repository.get('reportTemplateAssignments', agencyId, assignmentId)) {
      await dependencies.repository.create('reportTemplateAssignments', agencyId, assignmentId, {
        reportId,
        templateId,
        templateVersion,
        templateHash: template.contentHash,
        assignedAt: timestamp,
        assignedBy: principal.uid,
        immutable: true,
        origin: aggregate.report.origin,
      }, principal.uid);
    }

    if (!await dependencies.repository.get('outboxEvents', agencyId, eventId)) {
      await dependencies.repository.create('outboxEvents', agencyId, eventId, {
        eventType: 'report.exceptional_created',
        aggregateType: 'report',
        aggregateId: reportId,
        aggregateVersion: aggregate.report.version ?? 1,
        payload: { reportId, propertyId, origin: aggregate.report.origin, reasonCode, templateId, templateVersion },
        correlationId,
        status: 'pending',
        attempt: 0,
        availableAt: timestamp,
      }, principal.uid);
    }

    await dependencies.audit.append({
      id: randomUUID(),
      timestamp,
      actorId: principal.uid,
      actorRole: principal.role,
      agencyId,
      capability: 'agency.manage',
      outcome: 'allowed',
      reason: `material_action:reports.create_exceptional:${reasonCode}`,
      target: { agencyId, propertyId, ...(tenancyId ? { tenancyId } : {}), reportId },
      correlationId,
    });

    return {
      status: 201,
      body: {
        data: {
          reportId,
          assignmentId,
          origin: aggregate.report.origin,
          reportVersion: aggregate.report.version,
          workspaceRevision: aggregate.report.workspaceRevision,
        },
        meta: { correlationId },
      },
    };
  });
}
