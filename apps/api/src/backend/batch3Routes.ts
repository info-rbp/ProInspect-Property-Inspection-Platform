import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  buildEvidencePackManifest,
  buildPortfolioAuditRun,
  cloneBranding,
  publishBranding,
  retireBranding,
  type AgencyBrandingVersion,
  type EvidenceIndexRecord,
  type EvidencePackRecord,
  type PortfolioAuditProjection,
  type PortfolioAuditRunRecord,
} from '@pcr/domain';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import type { ApiResponse } from './router.js';
import { ApiError } from './router.js';
import type { ApiDependencies, IdempotencyResult } from './types.js';

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
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function key(req: IncomingMessage): string {
  const value = req.headers['idempotency-key']?.toString().trim();
  if (!value || value.length < 8 || value.length > 200) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required.');
  return value;
}

function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

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

function expectedVersion(body: Record<string, unknown>): number {
  const value = body.expectedVersion;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new ApiError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a positive integer.');
  return value;
}

async function audit(
  dependencies: ApiDependencies,
  principal: { uid: string; role: string; agencyId: string },
  capability: 'portfolio_audit.approve' | 'evidence.export' | 'agency.manage',
  action: string,
  correlationId: string,
  target: Record<string, unknown>,
): Promise<void> {
  await dependencies.audit.append({
    id: randomUUID(), timestamp: new Date().toISOString(), actorId: principal.uid, actorRole: principal.role,
    agencyId: principal.agencyId, capability, outcome: 'allowed', reason: `material_action:${action}`,
    target: { agencyId: principal.agencyId, ...(typeof target.propertyId === 'string' ? { propertyId: target.propertyId } : {}) }, correlationId,
  });
}

async function outbox(
  dependencies: ApiDependencies,
  agencyId: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  aggregateVersion: number,
  payload: Record<string, unknown>,
  correlationId: string,
  actorId: string,
): Promise<void> {
  await dependencies.repository.create('outboxEvents', agencyId, randomUUID(), {
    eventType, aggregateType, aggregateId, aggregateVersion, payload, correlationId,
    status: 'pending', attempt: 0, availableAt: new Date().toISOString(),
  }, actorId);
}

function patchWithoutSystemFields(record: Record<string, unknown>): Record<string, unknown> {
  const system = new Set(['id', 'agencyId', 'version', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);
  return Object.fromEntries(Object.entries(record).filter(([field]) => !system.has(field)));
}

export async function routeBatchThreeRequest(
  req: IncomingMessage,
  dependencies: ApiDependencies,
  correlationId: string,
  agencyId: string,
  resource: string,
  id: string | undefined,
  path: string[],
): Promise<ApiResponse | undefined> {
  if (req.method !== 'POST' || !id || path[0] !== 'commands' || !path[1]) return undefined;
  const command = path[1];
  const supported = resource === 'evidence-packs' && command === 'build-manifest'
    || resource === 'portfolio-audits' && command === 'evaluate'
    || resource === 'branding-versions' && ['publish', 'retire', 'clone'].includes(command);
  if (!supported) return undefined;
  const body = await readJson(req);

  if (resource === 'evidence-packs') {
    const existing = await dependencies.repository.get('evidencePacks', agencyId, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Evidence pack not found.');
    const version = expectedVersion(body);
    if (existing.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'The evidence pack has changed.', { expectedVersion: version, actualVersion: existing.version });
    const principal = await authenticateAndAuthorise(req, dependencies, 'evidence.export', { agencyId, ...(typeof existing.propertyId === 'string' ? { propertyId: existing.propertyId } : {}) }, correlationId);
    return idempotent(dependencies, req, agencyId, `evidence-packs:${id}:commands:build-manifest`, body, async () => {
      const page = await dependencies.repository.list('evidenceIndex', agencyId, 100);
      const manifest = buildEvidencePackManifest(existing as unknown as EvidencePackRecord, page.items as unknown as EvidenceIndexRecord[]);
      const updated = await dependencies.repository.update('evidencePacks', agencyId, id, {
        status: 'assembling', manifestHash: manifest.contentHash, manifest: manifest as unknown as Record<string, unknown>,
      }, version, principal.uid);
      await outbox(dependencies, agencyId, 'evidence_pack.manifest_built', 'evidence_pack', id, updated.version, { manifestHash: manifest.contentHash, itemCount: manifest.itemCount }, correlationId, principal.uid);
      await audit(dependencies, principal, 'evidence.export', 'evidence_pack.build_manifest', correlationId, updated);
      return { status: 200, body: { data: { pack: updated, manifest }, meta: { correlationId } } };
    });
  }

  if (resource === 'portfolio-audits') {
    const existing = await dependencies.repository.get('portfolioAudits', agencyId, id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Portfolio audit not found.');
    const version = expectedVersion(body);
    if (existing.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'The portfolio audit has changed.', { expectedVersion: version, actualVersion: existing.version });
    const principal = await authenticateAndAuthorise(req, dependencies, 'portfolio_audit.approve', { agencyId }, correlationId);
    const projections = body.projections;
    if (!Array.isArray(projections)) throw new ApiError(400, 'VALIDATION_ERROR', 'projections must be an array.');
    const propertyIds = Array.isArray((existing.scope as { propertyIds?: unknown } | undefined)?.propertyIds)
      ? ((existing.scope as { propertyIds: unknown[] }).propertyIds.filter((value): value is string => typeof value === 'string')) : [];
    return idempotent(dependencies, req, agencyId, `portfolio-audits:${id}:commands:evaluate`, body, async () => {
      const evaluated = buildPortfolioAuditRun(id, agencyId, propertyIds, projections as PortfolioAuditProjection[], principal.uid, new Date(typeof body.asAtDate === 'string' ? body.asAtDate : Date.now()));
      const patch = patchWithoutSystemFields(evaluated as unknown as Record<string, unknown>);
      const updated = await dependencies.repository.update('portfolioAudits', agencyId, id, patch, version, principal.uid);
      await outbox(dependencies, agencyId, 'portfolio_audit.evaluated', 'portfolio_audit', id, updated.version, { findingCount: evaluated.findings.length, ruleVersion: evaluated.ruleVersion }, correlationId, principal.uid);
      await audit(dependencies, principal, 'portfolio_audit.approve', 'portfolio_audit.evaluate', correlationId, updated);
      return { status: 200, body: { data: updated, meta: { correlationId } } };
    });
  }

  const existing = await dependencies.repository.get('brandingVersions', agencyId, id);
  if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Branding version not found.');
  const version = expectedVersion(body);
  if (existing.version !== version) throw new ApiError(409, 'VERSION_CONFLICT', 'The branding version has changed.', { expectedVersion: version, actualVersion: existing.version });
  const principal = await authenticateAndAuthorise(req, dependencies, 'agency.manage', { agencyId }, correlationId);
  return idempotent(dependencies, req, agencyId, `branding-versions:${id}:commands:${command}`, body, async () => {
    const current = existing as unknown as AgencyBrandingVersion;
    if (command === 'clone') {
      const nextVersion = Number(body.nextVersion);
      const clone = cloneBranding(current, nextVersion);
      const cloneId = typeof body.cloneId === 'string' && body.cloneId.trim() ? body.cloneId.trim() : `${current.id}-v${nextVersion}`;
      const stored = await dependencies.repository.create('brandingVersions', agencyId, cloneId, patchWithoutSystemFields(clone as unknown as Record<string, unknown>), principal.uid);
      await outbox(dependencies, agencyId, 'branding_version.cloned', 'branding_version', cloneId, stored.version, { sourceBrandingId: id, nextVersion }, correlationId, principal.uid);
      await audit(dependencies, principal, 'agency.manage', 'branding_version.clone', correlationId, stored);
      return { status: 201, body: { data: stored, meta: { correlationId } } };
    }
    const transitioned = command === 'publish' ? publishBranding(current) : retireBranding(current);
    const updated = await dependencies.repository.update('brandingVersions', agencyId, id, patchWithoutSystemFields(transitioned as unknown as Record<string, unknown>), version, principal.uid);
    await outbox(dependencies, agencyId, `branding_version.${command}`, 'branding_version', id, updated.version, { status: updated.status, contentHash: updated.contentHash }, correlationId, principal.uid);
    await audit(dependencies, principal, 'agency.manage', `branding_version.${command}`, correlationId, updated);
    return { status: 200, body: { data: updated, meta: { correlationId } } };
  });
}
