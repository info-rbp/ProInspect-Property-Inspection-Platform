import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReportAggregate } from '@pcr/domain';
import { createRequestHandler } from '../src/app.js';
import { MemoryIdempotencyStore } from '../src/backend/idempotency.js';
import type { ApiDependencies, OperationalRepository, Page, StoredRecord } from '../src/backend/types.js';

let server: ReturnType<typeof createServer> | undefined;
afterEach(() => server?.close());

class Records implements OperationalRepository {
  readonly values = new Map<string, StoredRecord>();
  private key(collection: string, agencyId: string, id: string) { return `${collection}:${agencyId}:${id}`; }
  async list(collection: string, agencyId: string): Promise<Page<StoredRecord>> { return { items: [...this.values.entries()].filter(([key]) => key.startsWith(`${collection}:${agencyId}:`)).map(([, value]) => value) }; }
  async get(collection: string, agencyId: string, id: string) { return this.values.get(this.key(collection, agencyId, id)); }
  async create(collection: string, agencyId: string, id: string, data: Record<string, unknown>, actorId: string) {
    const now = new Date().toISOString(); const record = { ...data, id, agencyId, version: 1, createdAt: now, updatedAt: now, createdBy: actorId } as StoredRecord;
    this.values.set(this.key(collection, agencyId, id), record); return record;
  }
  async update(collection: string, agencyId: string, id: string, data: Record<string, unknown>, expectedVersion: number, actorId: string) {
    const current = await this.get(collection, agencyId, id); if (!current) throw Object.assign(new Error('Not found'), { status: 404, code: 'NOT_FOUND' });
    if (current.version !== expectedVersion) throw Object.assign(new Error('Conflict'), { status: 409, code: 'VERSION_CONFLICT' });
    const updated = { ...current, ...data, version: current.version + 1, updatedAt: new Date().toISOString(), updatedBy: actorId } as StoredRecord;
    this.values.set(this.key(collection, agencyId, id), updated); return updated;
  }
}

function dependencies() {
  const repository = new Records();
  const deps: ApiDependencies = {
    requireAppCheck: false,
    identityVerifier: { verifyIdentityToken: async () => ({ uid: 'admin-1', agencyId: 'agency-a', authTime: 1, issuedAt: 1, mfaVerified: true }), verifyAppCheckToken: async () => undefined },
    memberships: { getMembership: async () => ({ uid: 'admin-1', agencyId: 'agency-a', role: 'proinspect_admin', status: 'active', mfaRequired: true, updatedAt: new Date().toISOString() }) },
    audit: { append: async () => undefined }, repository, idempotency: new MemoryIdempotencyStore(), tasks: { dispatch: async () => undefined },
    uploads: { create: async () => ({}), complete: async () => ({}) },
    reports: { load: async () => undefined, saveDraft: async (aggregate: ReportAggregate) => aggregate } as unknown as ApiDependencies['reports'],
  };
  return { deps, repository };
}

async function request(deps: ApiDependencies, path: string, body: Record<string, unknown>, idempotencyKey: string) {
  server = createServer(createRequestHandler(deps)).listen(0); await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  return fetch(`http://127.0.0.1:${address.port}${path}`, { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json', 'x-agency-id': 'agency-a', 'idempotency-key': idempotencyKey }, body: JSON.stringify(body) });
}

describe('Batch 3 scale commands', () => {
  it('builds an evidence pack manifest through a named command', async () => {
    const state = dependencies();
    await state.repository.create('evidencePacks', 'agency-a', 'pack-1', { propertyId: 'property-1', reportVersionIds: ['version-1'], evidenceIds: ['evidence-1'], requestedBy: 'admin-1', purpose: 'Owner review', authorisedRequesterId: 'owner-1', privacyReviewedBy: 'reviewer-1', status: 'approved', expiresAt: '2027-01-01T00:00:00.000Z' }, 'admin-1');
    await state.repository.create('evidenceIndex', 'agency-a', 'evidence-1', { propertyId: 'property-1', reportId: 'report-1', reportVersionId: 'version-1', componentIds: ['component-1'], evidenceType: 'photo', purposeTags: ['defect'], availableDerivatives: ['display'], privacyClassification: 'standard', retentionClass: 'tenancy-evidence', status: 'available' }, 'admin-1');
    const response = await request(state.deps, '/api/v1/evidence-packs/pack-1/commands/build-manifest', { expectedVersion: 1 }, 'batch3-evidence-1');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { pack: { status: 'assembling', version: 2 }, manifest: { itemCount: 1 } } });
  });

  it('evaluates a portfolio audit through a named command', async () => {
    const state = dependencies();
    await state.repository.create('portfolioAudits', 'agency-a', 'audit-1', { scope: { propertyIds: ['property-1'], asAtDate: '2026-07-20T00:00:00.000Z' }, ruleVersion: 'pending', status: 'queued', findings: [], createdBy: 'admin-1' }, 'admin-1');
    const response = await request(state.deps, '/api/v1/portfolio-audits/audit-1/commands/evaluate', { expectedVersion: 1, asAtDate: '2026-07-20T00:00:00.000Z', projections: [{ propertyId: 'property-1', hasEntryBaseline: false, unresolvedHighMaintenance: 1, evidenceReadiness: 0.5, accessFailureCount: 2, hasFinalArchive: false, keyAccessComplete: false }] }, 'batch3-audit-1');
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { status: string; findings: unknown[]; version: number } };
    expect(payload.data.status).toBe('review_required');
    expect(payload.data.findings.length).toBeGreaterThan(0);
    expect(payload.data.version).toBe(2);
  });

  it('publishes and clones branding through named commands', async () => {
    const state = dependencies();
    await state.repository.create('brandingVersions', 'agency-a', 'brand-1', { primaryColour: '#111111', secondaryColour: '#f2b705', contactDetails: { phone: '08 1234 5678' }, emailSenderName: 'Agency Team', status: 'draft', contentHash: '' }, 'admin-1');
    const published = await request(state.deps, '/api/v1/branding-versions/brand-1/commands/publish', { expectedVersion: 1 }, 'batch3-brand-1');
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ data: { status: 'published', version: 2 } });
    server?.close();
    const cloned = await request(state.deps, '/api/v1/branding-versions/brand-1/commands/clone', { expectedVersion: 2, nextVersion: 3, cloneId: 'brand-3' }, 'batch3-brand-2');
    expect(cloned.status).toBe(201);
    expect(await cloned.json()).toMatchObject({ data: { id: 'brand-3', status: 'draft', version: 1 } });
  });
});
