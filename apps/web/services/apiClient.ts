import { getApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { runShellOperation } from './runShellOperation';
import { enqueueMutation } from './offline/offlineQueue';
import { canQueueMutation } from './offline/queueSecurity';

interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    status?: number;
    correlationId?: string;
    details?: Record<string, unknown>;
  };
}

type MutationMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface ApiRequestOptions {
  method?: 'GET' | MutationMethod;
  body?: unknown;
  idempotencyKey?: string;
  dirtyScopeId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  baseVersion?: number;
  workspaceRevision?: number;
  fieldPatchPaths?: string[];
  dependencyIds?: string[];
  localSnapshotId?: string;
  dataClassification?: 'standard' | 'personal' | 'sensitive';
  conflictPolicy?: 'field_merge' | 'manual' | 'server_reject';
  queueWhenOffline?: boolean;
  announceSuccess?: boolean;
}

class OfflineQueuedError extends Error {
  code = 'OFFLINE_QUEUED';
  retryable = true;

  constructor(public queueId: string) {
    super('The change is saved in the offline queue and will synchronise when this user reconnects.');
    this.name = 'OfflineQueuedError';
  }
}

let appCheck: AppCheck | undefined;

async function appCheckToken(): Promise<string | undefined> {
  const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY?.trim();
  if (!siteKey) return undefined;
  if (!appCheck) {
    try {
      appCheck = initializeAppCheck(getApp(), {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      return undefined;
    }
  }
  return (await getToken(appCheck)).token;
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function apiRequest<T>(
  agencyId: string | undefined,
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const method = init.method ?? 'GET';
  const idempotencyKey = init.idempotencyKey ?? newIdempotencyKey();
  const execute = async (): Promise<T> => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
    if (!baseUrl) throw new Error('VITE_API_BASE_URL is required for cloud operations.');
    let user;
    try {
      user = getAuth().currentUser;
    } catch {
      user = null;
    }
    if (!user) throw new Error('Sign in before accessing cloud records.');
    const tokenResult = await user.getIdTokenResult();
    const claimAgency = typeof tokenResult.claims.agencyId === 'string' ? tokenResult.claims.agencyId : undefined;
    const resolvedAgencyId = agencyId || user.tenantId || claimAgency;
    if (!resolvedAgencyId) throw new Error('The signed-in identity is not linked to an agency.');

    if (method !== 'GET' && !navigator.onLine && init.queueWhenOffline && canQueueMutation(method, path)) {
      const queued = await enqueueMutation({
        id: idempotencyKey,
        agencyId: resolvedAgencyId,
        actorId: user.uid,
        entityType: init.entityType ?? 'record',
        entityId: init.entityId,
        method,
        path,
        body: init.body,
        idempotencyKey,
        baseVersion: init.baseVersion,
        workspaceRevision: init.workspaceRevision,
        fieldPatchPaths: init.fieldPatchPaths,
        dependencyIds: init.dependencyIds,
        localSnapshotId: init.localSnapshotId,
        dataClassification: init.dataClassification ?? 'standard',
        conflictPolicy: init.conflictPolicy ?? 'manual',
      });
      throw new OfflineQueuedError(queued.id);
    }
    const appCheckValue = await appCheckToken();
    const headers: Record<string, string> = {
      authorization: `Bearer ${tokenResult.token}`,
      'x-agency-id': resolvedAgencyId,
      accept: 'application/json',
    };
    if (appCheckValue) headers['x-firebase-appcheck'] = appCheckValue;
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers['idempotency-key'] = idempotencyKey;
    if (init.baseVersion !== undefined) headers['if-match'] = `"record-version-${init.baseVersion}"`;

    const response = await fetch(`${baseUrl.replace(/\/$/u, '')}${path}`, {
      method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const payload = await response.json() as ApiEnvelope<T> & ApiErrorEnvelope;
    if (!response.ok) {
      const error = new Error(payload.error?.message ?? 'The API request failed.');
      Object.assign(error, payload.error, { status: payload.error?.status ?? response.status });
      throw error;
    }
    return payload.data;
  };

  if (method === 'GET') return execute();
  return runShellOperation({
    kind: 'sync',
    title: 'Synchronising changes',
    source: path,
    persistence: 'cloud',
    dirtyScopeId: init.dirtyScopeId,
    entityType: init.entityType,
    entityId: init.entityId,
    action: init.action ?? method.toLowerCase(),
    announceSuccess: init.announceSuccess,
  }, execute);
}
