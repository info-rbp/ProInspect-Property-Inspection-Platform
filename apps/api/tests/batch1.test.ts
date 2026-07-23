import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReportAggregate } from '@pcr/domain';
import type { InspectionTypeTemplate } from '@pcr/templates';
import type { TemplateRepository } from '@pcr/templates/registry';
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

class Templates implements TemplateRepository {
  readonly values = new Map<string, InspectionTypeTemplate>();
  private key(id: string, version: number) { return `${id}@${version}`; }
  async get(id: string, version: number) { return this.values.get(this.key(id, version)); }
  async save(template: InspectionTypeTemplate) { this.values.set(this.key(template.id, template.version), structuredClone(template)); }
  async list(id?: string) { return [...this.values.values()].filter((template) => !id || template.id === id); }
  async findAssignment() { return undefined; }
  async saveAssignment() { return undefined; }
}

const source: ReportAggregate = {
  report: {
    id: 'report-1', agencyId: 'agency-a', propertyId: 'property-1', inspectionJobId: 'job-1', reportType: 'Routine Inspection',
    propertyAddress: '1 Test Street', lifecycleStatus: 'draft', templateId: 'wa-routine-residential-v1', templateVersion: 1,
    templateHash: 'hash', workspaceRevision: 3, schemaVersion: 2, version: 4, currentVersionId: 'version-4',
  },
  areas: [{ id: 'area-1', name: 'Entry', sequence: 1, version: 1, components: [{
    id: 'component-1', component: 'Front Door', visibility: 'visible', conditionCategory: 'minor_wear', cleanlinessCategory: 'clean',
    workingStatus: 'untested', testStatus: 'untested', defects: ['Scuff'], maintenanceRequired: true, commentary: 'Minor scuff.',
    photoReferences: [{ photoId: 'photo-1', objectPath: 'original.jpg', generation: '1', sha256: 'abc' }], reviewStatus: 'draft', comparisonStatus: 'not_compared', version: 1,
  }] }],
};

function dependencies() {
  const repository = new Records();
  const templates = new Templates();
  let aggregate = structuredClone(source);
  const reports = {
    load: async (agencyId: string, reportId: string) => aggregate.report.agencyId === agencyId && aggregate.report.id === reportId ? aggregate : undefined,
    saveDraft: async (next: ReportAggregate, expectedVersion?: number) => {
      if (next.report.id === aggregate.report.id && expectedVersion !== aggregate.report.version) throw Object.assign(new Error('Conflict'), { status: 409, code: 'VERSION_CONFLICT' });
      aggregate = { ...structuredClone(next), report: { ...next.report, version: expectedVersion ? expectedVersion + 1 : 1, workspaceRevision: next.report.workspaceRevision ?? 1 } };
      return aggregate;
    },
  } as unknown as ApiDependencies['reports'];
  const deps: ApiDependencies = {
    requireAppCheck: false,
    identityVerifier: { verifyIdentityToken: async () => ({ uid: 'admin-1', agencyId: 'agency-a', authTime: 1, issuedAt: 1, mfaVerified: true }), verifyAppCheckToken: async () => undefined },
    memberships: { getMembership: async () => ({ uid: 'admin-1', agencyId: 'agency-a', role: 'proinspect_admin', status: 'active', mfaRequired: true, updatedAt: new Date().toISOString() }) },
    audit: { append: async () => undefined }, repository, reports, idempotency: new MemoryIdempotencyStore(), tasks: { dispatch: async () => undefined },
    uploads: { create: async () => ({}), complete: async () => ({}) }, templateRepository: () => templates,
  };
  return { deps, repository, templates, aggregate: () => aggregate };
}

async function request(deps: ApiDependencies, path: string, init: RequestInit = {}) {
  server = createServer(createRequestHandler(deps)).listen(0); await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address');
  return fetch(`http://127.0.0.1:${address.port}${path}`, init);
}

const headers = { authorization: 'Bearer token', 'content-type': 'application/json', 'x-agency-id': 'agency-a', 'idempotency-key': 'batch-one-request-1' };

describe('Batch 1 inspection product APIs', () => {
  it('creates a clone with new identities and without copied evidence', async () => {
    const state = dependencies();
    const response = await request(state.deps, '/api/v1/reports/report-1/commands/clone', { method: 'POST', headers, body: JSON.stringify({ carryCommentary: true, carryMaintenance: true }) });
    expect(response.status).toBe(201);
    const payload = await response.json() as { data: { reportId: string; aggregate: ReportAggregate } };
    expect(payload.data.reportId).not.toBe('report-1');
    expect(payload.data.aggregate.report.lifecycleStatus).toBe('draft');
    expect(payload.data.aggregate.areas[0]?.id).not.toBe('area-1');
    expect(payload.data.aggregate.areas[0]?.components[0]?.id).not.toBe('component-1');
    expect(payload.data.aggregate.areas[0]?.components[0]?.sourceComponentId).toBe('component-1');
    expect(payload.data.aggregate.areas[0]?.components[0]?.photoReferences).toEqual([]);
  });

  it('rejects generic inspection-job transitions', async () => {
    const state = dependencies();
    await state.repository.create('inspectionJobs', 'agency-a', 'job-1', { propertyId: 'property-1', reportId: 'report-1', status: 'assigned' }, 'admin-1');
    const response = await request(state.deps, '/api/v1/inspection-jobs/job-1/transitions', { method: 'POST', headers, body: JSON.stringify({ status: 'inspection_started', expectedVersion: 1 }) });
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: { code: 'GENERIC_TRANSITION_DISABLED' } });
  });

  it('executes a valid named inspection command', async () => {
    const state = dependencies();
    await state.repository.create('inspectionJobs', 'agency-a', 'job-1', { propertyId: 'property-1', reportId: 'report-1', status: 'assigned', assignedInspectorId: 'admin-1' }, 'admin-1');
    const response = await request(state.deps, '/api/v1/inspection-jobs/job-1/commands/start-inspection', { method: 'POST', headers, body: JSON.stringify({ expectedVersion: 1 }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { status: 'inspection_started', version: 2 } });
  });

  it('creates and publishes an agency template draft', async () => {
    const state = dependencies();
    const created = await request(state.deps, '/api/v1/template-library', { method: 'POST', headers, body: JSON.stringify({ sourceTemplateId: 'wa-entry-residential-v1', sourceTemplateVersion: 1, id: 'agency-entry', version: 1 }) });
    expect(created.status).toBe(201);
    server?.close();
    const publishHeaders = { ...headers, 'idempotency-key': 'batch-one-request-2' };
    const published = await request(state.deps, '/api/v1/template-library/agency-entry/1/commands/publish', { method: 'POST', headers: publishHeaders, body: '{}' });
    expect(published.status).toBe(200);
    expect(await published.json()).toMatchObject({ data: { id: 'agency-entry', version: 1, status: 'published' } });
  });
});
