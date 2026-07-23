import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  assertTemplateEditable,
  publishTemplate,
  retireTemplate,
  validateTemplate,
  type InspectionTypeTemplate,
} from '@pcr/templates';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '@pcr/templates/presets/wa';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import type { ApiResponse } from './router.js';
import type { ApiDependencies, IdempotencyResult } from './types.js';

class TemplateRouteError extends Error {
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
    if (length > 2_000_000) throw new TemplateRouteError(413, 'PAYLOAD_TOO_LARGE', 'Template payload exceeds 2 MB.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new TemplateRouteError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function idempotencyKey(req: IncomingMessage): string {
  const value = req.headers['idempotency-key']?.toString().trim();
  if (!value || value.length < 8 || value.length > 200) throw new TemplateRouteError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required.');
  return value;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function idempotent(
  dependencies: ApiDependencies,
  req: IncomingMessage,
  agencyId: string,
  operation: string,
  body: Record<string, unknown>,
  action: () => Promise<IdempotencyResult>,
): Promise<ApiResponse> {
  const execution = await dependencies.idempotency.execute(agencyId, operation, idempotencyKey(req), digest(body), action);
  return { status: execution.result.status, body: execution.result.body, headers: { 'idempotency-replayed': String(execution.replayed) } };
}

function templateVersion(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new TemplateRouteError(400, 'TEMPLATE_VERSION_INVALID', 'Template version must be a positive integer.');
  return parsed;
}

function draftFromSource(source: InspectionTypeTemplate, input: Record<string, unknown>, actorId: string): InspectionTypeTemplate {
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : source.id;
  const version = templateVersion(input.version ?? source.version + 1);
  return {
    ...structuredClone(source),
    id,
    version,
    status: 'draft',
    sourceTemplateId: source.id,
    sourceTemplateVersion: source.version,
    createdAt: new Date().toISOString(),
    sourcePreset: source.sourcePreset ?? source.id,
    contentHash: undefined,
    publishedAt: undefined,
    retiredAt: undefined,
    commentaryBank: structuredClone(source.commentaryBank),
    areas: structuredClone(source.areas),
    permittedApprovalRoles: source.permittedApprovalRoles ? [...source.permittedApprovalRoles] : undefined,
  } as InspectionTypeTemplate & { createdBy?: string };
}

function normaliseDraft(input: Record<string, unknown>, existing?: InspectionTypeTemplate): InspectionTypeTemplate {
  const value = input.template && typeof input.template === 'object' ? input.template as Record<string, unknown> : input;
  const template = structuredClone({ ...(existing ?? {}), ...value }) as InspectionTypeTemplate;
  template.status = 'draft';
  template.createdAt = existing?.createdAt ?? template.createdAt ?? new Date().toISOString();
  delete template.publishedAt;
  delete template.retiredAt;
  delete template.contentHash;
  validateTemplate(template);
  return template;
}

async function sourceTemplate(
  repository: ReturnType<NonNullable<ApiDependencies['templateRepository']>>,
  sourceId: string,
  sourceVersion: number,
): Promise<InspectionTypeTemplate | undefined> {
  return WA_RESIDENTIAL_V1_TEMPLATES.find((candidate) => candidate.id === sourceId && candidate.version === sourceVersion)
    ?? repository.get(sourceId, sourceVersion);
}

export async function routeTemplateLibraryRequest(
  req: IncomingMessage,
  dependencies: ApiDependencies,
  correlationId: string,
  agencyId: string,
  path: string[],
): Promise<ApiResponse | undefined> {
  if (!dependencies.templateRepository) throw new TemplateRouteError(503, 'TEMPLATE_REPOSITORY_UNAVAILABLE', 'Template repository is not configured.');
  const principal = await authenticateAndAuthorise(req, dependencies, req.method === 'GET' ? 'report.read' : 'template.manage', { agencyId }, correlationId);
  const repository = dependencies.templateRepository(agencyId, principal.uid);

  if (req.method === 'GET' && !path.length) {
    const stored = await repository.list();
    const merged = [...WA_RESIDENTIAL_V1_TEMPLATES, ...stored]
      .filter((template, index, all) => all.findIndex((candidate) => candidate.id === template.id && candidate.version === template.version) === index)
      .sort((left, right) => left.inspectionType.localeCompare(right.inspectionType) || left.id.localeCompare(right.id) || left.version - right.version);
    return { status: 200, body: { data: merged, meta: { correlationId, actor: principal.uid } } };
  }

  if (req.method === 'POST' && !path.length) {
    const body = await readJson(req);
    return idempotent(dependencies, req, agencyId, 'template-library:create', body, async () => {
      let draft: InspectionTypeTemplate;
      if (typeof body.sourceTemplateId === 'string') {
        const source = await sourceTemplate(repository, body.sourceTemplateId, templateVersion(body.sourceTemplateVersion));
        if (!source) throw new TemplateRouteError(404, 'SOURCE_TEMPLATE_NOT_FOUND', 'Source template version was not found.');
        draft = draftFromSource(source, body, principal.uid);
      } else {
        draft = normaliseDraft(body);
      }
      const existing = await repository.get(draft.id, draft.version);
      if (existing) throw new TemplateRouteError(409, 'TEMPLATE_VERSION_EXISTS', 'This template version already exists.');
      await repository.save(draft);
      return { status: 201, body: { data: draft, meta: { correlationId } } };
    });
  }

  const templateId = path[0];
  const versionValue = path[1];
  if (!templateId || !versionValue) return undefined;
  const versionNumber = templateVersion(versionValue);
  const existing = await repository.get(templateId, versionNumber)
    ?? WA_RESIDENTIAL_V1_TEMPLATES.find((candidate) => candidate.id === templateId && candidate.version === versionNumber);
  if (!existing) throw new TemplateRouteError(404, 'TEMPLATE_NOT_FOUND', 'Template version was not found.');

  if (req.method === 'GET' && path.length === 2) {
    return { status: 200, body: { data: existing, meta: { correlationId, actor: principal.uid } } };
  }

  if (req.method === 'PATCH' && path.length === 2) {
    const body = await readJson(req);
    return idempotent(dependencies, req, agencyId, `template-library:${templateId}:${versionNumber}:update`, body, async () => {
      assertTemplateEditable(existing);
      const updated = normaliseDraft(body, existing);
      if (updated.id !== templateId || updated.version !== versionNumber) throw new TemplateRouteError(409, 'TEMPLATE_IDENTITY_IMMUTABLE', 'Template identity cannot be changed in place.');
      await repository.save(updated);
      return { status: 200, body: { data: updated, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && path[2] === 'commands' && path[3]) {
    const action = path[3];
    const body = await readJson(req);
    return idempotent(dependencies, req, agencyId, `template-library:${templateId}:${versionNumber}:${action}`, body, async () => {
      if (action === 'publish') {
        assertTemplateEditable(existing);
        const published = publishTemplate(existing);
        await repository.save(published);
        return { status: 200, body: { data: published, meta: { correlationId } } };
      }
      if (action === 'retire') {
        const retired = retireTemplate(existing);
        await repository.save(retired);
        return { status: 200, body: { data: retired, meta: { correlationId } } };
      }
      if (action === 'clone') {
        const versions = await repository.list(templateId);
        const nextVersion = Math.max(versionNumber, ...versions.map((candidate) => candidate.version)) + 1;
        const cloned = draftFromSource(existing, {
          id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : templateId,
          version: body.version ?? nextVersion,
        }, principal.uid);
        if (await repository.get(cloned.id, cloned.version)) throw new TemplateRouteError(409, 'TEMPLATE_VERSION_EXISTS', 'The cloned template version already exists.');
        await repository.save(cloned);
        return { status: 201, body: { data: cloned, meta: { correlationId } } };
      }
      throw new TemplateRouteError(404, 'COMMAND_NOT_FOUND', `Unknown template command: ${action}.`);
    });
  }

  return undefined;
}
