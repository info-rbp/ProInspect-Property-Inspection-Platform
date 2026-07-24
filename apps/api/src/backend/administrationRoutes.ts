import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { UserRole } from '@pcr/domain';
import { authenticateAndAuthorise } from '../security/authoriseRequest.js';
import type { ApiResponse } from './router.js';
import type { ApiDependencies, IdempotencyResult, StoredRecord } from './types.js';

class AdministrationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
  }
}

const ROLES = new Set<UserRole>(['super_admin', 'proinspect_admin', 'operations', 'inspector', 'analyst', 'reviewer', 'property_manager', 'maintenance_coordinator', 'tenant', 'landlord', 'shopify_customer']);
const PRIVILEGED = new Set<UserRole>(['super_admin', 'proinspect_admin', 'operations', 'analyst', 'reviewer']);

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object required');
    return body as Record<string, unknown>;
  } catch {
    throw new AdministrationError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AdministrationError(400, 'VALIDATION_ERROR', `${field} is required.`);
  return value.trim();
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new AdministrationError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion must be a positive integer.');
  return value;
}

function key(req: IncomingMessage): string {
  const value = req.headers['idempotency-key']?.toString().trim();
  if (!value || value.length < 8 || value.length > 200) throw new AdministrationError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key is required.');
  return value;
}

function digest(body: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function deterministicId(agencyId: string, idempotencyKey: string, kind: string): string {
  return createHash('sha256').update(`${agencyId}|${idempotencyKey}|${kind}`).digest('hex').slice(0, 32);
}

async function idempotent(dependencies: ApiDependencies, req: IncomingMessage, agencyId: string, operation: string, body: Record<string, unknown>, action: () => Promise<IdempotencyResult>): Promise<ApiResponse> {
  const result = await dependencies.idempotency.execute(agencyId, operation, key(req), digest(body), action);
  return { status: result.result.status, body: result.result.body, headers: { 'idempotency-replayed': String(result.replayed) } };
}

async function outbox(dependencies: ApiDependencies, agencyId: string, eventId: string, type: string, aggregateId: string, actorId: string, correlationId: string, payload: Record<string, unknown>): Promise<void> {
  if (await dependencies.repository.get('outboxEvents', agencyId, eventId)) return;
  await dependencies.repository.create('outboxEvents', agencyId, eventId, {
    eventType: type, aggregateType: 'administration', aggregateId, aggregateVersion: 1,
    payload, correlationId, status: 'pending', attempt: 0, availableAt: new Date().toISOString(),
  }, actorId);
}

async function activeAdministrators(dependencies: ApiDependencies, agencyId: string): Promise<StoredRecord[]> {
  const page = await dependencies.repository.list('users', agencyId, 100);
  return page.items.filter((user) => user.status === 'active' && ['super_admin', 'proinspect_admin'].includes(String(user.role)));
}

function workload(users: StoredRecord[], jobs: StoredRecord[], reports: StoredRecord[]): Record<string, unknown>[] {
  const now = Date.now();
  return users.filter((user) => user.status === 'active').map((user) => {
    const assignments = jobs.filter((job) => job.assignedInspectorId === user.id || job.assignedReviewerId === user.id);
    const active = assignments.filter((job) => !['finalised', 'archived', 'cancelled'].includes(String(job.status)));
    const overdue = active.filter((job) => typeof job.scheduledAt === 'string' && Date.parse(job.scheduledAt) < now);
    const waiting = reports.filter((report) => report.assignedUserId === user.id || report.assignedAnalystId === user.id || report.assignedReviewerId === user.id)
      .filter((report) => ['internal_review', 'review_required', 'changes_requested', 'approved_for_issue'].includes(String(report.lifecycleStatus)));
    const scheduled = active.map((job) => String(job.scheduledAt ?? '')).filter(Boolean).sort();
    return { userId: user.id, activeJobs: active.length, overdueJobs: overdue.length, reportsAwaitingAction: waiting.length, ...(scheduled[0] ? { nextAssignmentAt: scheduled[0] } : {}), conflictingAssignmentIds: [] };
  });
}

export async function routeAdministrationRequest(req: IncomingMessage, dependencies: ApiDependencies, correlationId: string, agencyId: string, path: string[]): Promise<ApiResponse | undefined> {
  const [resource, id, commandGroup, command] = path;
  if (!resource) return undefined;

  if (req.method === 'GET' && resource === 'workload') {
    const principal = await authenticateAndAuthorise(req, dependencies, 'job.read', { agencyId }, correlationId);
    const [users, jobs, reports] = await Promise.all([
      dependencies.repository.list('users', agencyId, 100),
      dependencies.repository.list('inspectionJobs', agencyId, 100),
      dependencies.repository.list('reports', agencyId, 100),
    ]);
    return { status: 200, body: { data: workload(users.items, jobs.items, reports.items), meta: { correlationId, actor: principal.uid } } };
  }

  if (req.method === 'POST' && resource === 'invitations' && !id) {
    const body = await readJson(req);
    const email = text(body.email, 'email').toLowerCase();
    const role = text(body.role, 'role') as UserRole;
    if (!ROLES.has(role)) throw new AdministrationError(400, 'ROLE_INVALID', 'role is not supported.');
    const principal = await authenticateAndAuthorise(req, dependencies, 'user.invite', { agencyId }, correlationId);
    const idempotencyKey = key(req);
    return idempotent(dependencies, req, agencyId, 'administration:invitations:create', body, async () => {
      const invitationId = deterministicId(agencyId, idempotencyKey, 'invitation');
      const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : new Date(Date.now() + 7 * 86_400_000).toISOString();
      const existing = await dependencies.repository.get('invitations', agencyId, invitationId);
      const invitation = existing ?? await dependencies.repository.create('invitations', agencyId, invitationId, { email, role, status: 'sent', expiresAt, invitedBy: principal.uid }, principal.uid);
      await outbox(dependencies, agencyId, deterministicId(agencyId, idempotencyKey, 'event'), 'user_invitation.sent', invitationId, principal.uid, correlationId, { invitationId, email, role, expiresAt });
      return { status: 201, body: { data: invitation, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && resource === 'invitations' && id && commandGroup === 'commands' && command) {
    const body = await readJson(req);
    const invitation = await dependencies.repository.get('invitations', agencyId, id);
    if (!invitation) throw new AdministrationError(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, 'user.invite', { agencyId }, correlationId);
    const target = command === 'revoke' ? 'revoked' : command === 'resend' ? 'sent' : command === 'accept' ? 'accepted' : undefined;
    if (!target) throw new AdministrationError(404, 'COMMAND_NOT_FOUND', 'Invitation command not found.');
    return idempotent(dependencies, req, agencyId, `administration:invitations:${id}:${command}`, body, async () => {
      const updated = await dependencies.repository.update('invitations', agencyId, id, { status: target, ...(target === 'accepted' ? { acceptedByUid: text(body.uid, 'uid') } : {}), ...(target === 'sent' ? { expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() } : {}) }, version(body.expectedVersion), principal.uid);
      return { status: 200, body: { data: updated, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && resource === 'users' && id && commandGroup === 'commands' && command) {
    const body = await readJson(req);
    const user = await dependencies.repository.get('users', agencyId, id);
    if (!user) throw new AdministrationError(404, 'USER_NOT_FOUND', 'User not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, command === 'change-role' ? 'user.role.change' : 'user.suspend', { agencyId }, correlationId);
    if (id === principal.uid && ['change-role', 'suspend', 'revoke'].includes(command)) throw new AdministrationError(409, 'SELF_ADMINISTRATION_BLOCKED', 'Administrators cannot demote, suspend or revoke themselves.');
    let patch: Record<string, unknown>;
    if (command === 'change-role') {
      const role = text(body.role, 'role') as UserRole;
      if (!ROLES.has(role)) throw new AdministrationError(400, 'ROLE_INVALID', 'role is not supported.');
      patch = { role, mfaRequired: PRIVILEGED.has(role) };
    } else if (command === 'suspend') patch = { status: 'suspended' };
    else if (command === 'reactivate') patch = { status: 'active' };
    else if (command === 'revoke') patch = { status: 'revoked' };
    else if (command === 'require-mfa') patch = { mfaRequired: body.required !== false };
    else if (command === 'record-mfa-enrolled') patch = { mfaEnrolled: body.enrolled === true };
    else if (command === 'revoke-sessions') patch = { lastSessionRevokedAt: new Date().toISOString() };
    else throw new AdministrationError(404, 'COMMAND_NOT_FOUND', 'User command not found.');
    if (['suspend', 'revoke'].includes(command) && ['super_admin', 'proinspect_admin'].includes(String(user.role))) {
      const admins = await activeAdministrators(dependencies, agencyId);
      if (admins.length <= 1) throw new AdministrationError(409, 'FINAL_ADMIN_REQUIRED', 'The final active administrator cannot be removed.');
    }
    return idempotent(dependencies, req, agencyId, `administration:users:${id}:${command}`, body, async () => {
      const updated = await dependencies.repository.update('users', agencyId, id, patch, version(body.expectedVersion), principal.uid);
      await outbox(dependencies, agencyId, randomUUID(), `user.${command.replaceAll('-', '_')}`, id, principal.uid, correlationId, { userId: id, ...patch });
      return { status: 200, body: { data: updated, meta: { correlationId } } };
    });
  }

  if (req.method === 'POST' && resource === 'tenancies' && id && commandGroup === 'commands' && command) {
    const body = await readJson(req);
    const tenancy = await dependencies.repository.get('tenancies', agencyId, id);
    if (!tenancy) throw new AdministrationError(404, 'TENANCY_NOT_FOUND', 'Tenancy not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, 'tenancy.manage', { agencyId, propertyId: String(tenancy.propertyId), tenancyId: id }, correlationId);
    if (command === 'activate') {
      const page = await dependencies.repository.list('tenancies', agencyId, 100);
      const overlap = page.items.find((candidate) => candidate.id !== id && candidate.propertyId === tenancy.propertyId && candidate.status === 'active');
      if (overlap && body.allowOverlap !== true) throw new AdministrationError(409, 'ACTIVE_TENANCY_CONFLICT', 'The property already has an active tenancy.', { tenancyId: overlap.id });
    }
    const status = command === 'activate' ? 'active' : command === 'end' ? 'inactive' : undefined;
    if (!status) throw new AdministrationError(404, 'COMMAND_NOT_FOUND', 'Tenancy command not found.');
    return idempotent(dependencies, req, agencyId, `administration:tenancies:${id}:${command}`, body, async () => ({ status: 200, body: { data: await dependencies.repository.update('tenancies', agencyId, id, { status, ...(command === 'end' ? { leaseEndDate: body.leaseEndDate ?? new Date().toISOString().slice(0, 10) } : {}) }, version(body.expectedVersion), principal.uid), meta: { correlationId } } }));
  }

  if (req.method === 'POST' && resource === 'properties' && id && commandGroup === 'commands' && command) {
    const body = await readJson(req);
    const property = await dependencies.repository.get('properties', agencyId, id);
    if (!property) throw new AdministrationError(404, 'PROPERTY_NOT_FOUND', 'Property not found.');
    const principal = await authenticateAndAuthorise(req, dependencies, 'property.manage', { agencyId, propertyId: id }, correlationId);
    if (command === 'archive') {
      const jobs = await dependencies.repository.list('inspectionJobs', agencyId, 100);
      const active = jobs.items.find((job) => job.propertyId === id && !['finalised', 'archived', 'cancelled'].includes(String(job.status)));
      if (active) throw new AdministrationError(409, 'ACTIVE_JOB_EXISTS', 'Property cannot be archived while an active inspection job exists.', { inspectionJobId: active.id });
    }
    const status = command === 'archive' ? 'archived' : command === 'restore' ? 'active' : undefined;
    if (!status) throw new AdministrationError(404, 'COMMAND_NOT_FOUND', 'Property command not found.');
    return idempotent(dependencies, req, agencyId, `administration:properties:${id}:${command}`, body, async () => ({ status: 200, body: { data: await dependencies.repository.update('properties', agencyId, id, { status }, version(body.expectedVersion), principal.uid), meta: { correlationId } } }));
  }

  return undefined;
}
