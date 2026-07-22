import { apiRequest } from '../../../services/apiClient';

export interface UploadSessionResponse {
  id: string;
  status: string;
  resumableUploadUrl?: string;
  duplicatePhotoId?: string;
  objectPath?: string;
}

export const createUploadSession = (agencyId: string, input: Record<string, unknown>, idempotencyKey: string) =>
  apiRequest<UploadSessionResponse>(agencyId, '/api/v1/uploads', {
    method: 'POST', body: input, idempotencyKey, entityType: 'upload', action: 'create upload session', queueWhenOffline: false,
  });

export const completeUploadSession = (agencyId: string, sessionId: string, idempotencyKey: string) =>
  apiRequest<Record<string, unknown>>(agencyId, `/api/v1/uploads/${encodeURIComponent(sessionId)}/complete`, {
    method: 'POST', body: {}, idempotencyKey, entityType: 'upload', entityId: sessionId, action: 'verify upload completion', queueWhenOffline: false,
  });
