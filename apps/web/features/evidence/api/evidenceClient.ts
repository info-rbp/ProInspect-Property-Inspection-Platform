import { apiRequest } from '../../../services/apiClient';

export interface UploadSessionResponse {
  id: string;
  status: string;
  resumableUploadUrl?: string;
  duplicatePhotoId?: string;
  objectPath?: string;
}

export interface PhotoEvidenceResponse {
  id: string;
  agencyId?: string;
  propertyId?: string;
  inspectionJobId?: string;
  reportId?: string;
  areaId?: string;
  componentIds?: string[];
  objectPath: string;
  generation: string;
  sha256: string;
  contentType?: string;
  processingStatus?: string;
  thumbnailObjectPath?: string;
  displayObjectPath?: string;
}

export interface EvidenceUploadContext {
  propertyId: string;
  inspectionJobId: string;
  reportId: string;
  areaId: string;
  componentIds: string[];
}

export const createUploadSession = (agencyId: string, input: Record<string, unknown>, idempotencyKey: string) =>
  apiRequest<UploadSessionResponse>(agencyId, '/api/v1/uploads', {
    method: 'POST', body: input, idempotencyKey, entityType: 'upload', action: 'create upload session', queueWhenOffline: false,
  });

export const completeUploadSession = (agencyId: string, sessionId: string, idempotencyKey: string) =>
  apiRequest<PhotoEvidenceResponse>(agencyId, `/api/v1/uploads/${encodeURIComponent(sessionId)}/complete`, {
    method: 'POST', body: {}, idempotencyKey, entityType: 'upload', entityId: sessionId, action: 'verify upload completion', queueWhenOffline: false,
  });

export const getPhotoEvidence = (agencyId: string, photoId: string) =>
  apiRequest<PhotoEvidenceResponse>(agencyId, `/api/v1/photo-evidence/${encodeURIComponent(photoId)}`);

async function sha256(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function uploadChunk(file: File, uploadUrl: string, start: number, chunkSize: number): Promise<number> {
  const end = Math.min(start + chunkSize, file.size);
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'content-range': `bytes ${start}-${end - 1}/${file.size}`,
    },
    body: file.slice(start, end),
  });
  if (response.status === 308) {
    const range = response.headers.get('range');
    return range ? Number(range.split('-').pop()) + 1 : end;
  }
  if (!response.ok) throw new Error(`Evidence upload failed with status ${response.status}.`);
  return file.size;
}

export async function uploadEvidenceFile(
  agencyId: string,
  context: EvidenceUploadContext,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<PhotoEvidenceResponse> {
  if (!file.size) throw new Error('The selected evidence file is empty.');
  const contentType = file.type || 'application/octet-stream';
  if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    throw new Error('Evidence must be an image or video file.');
  }
  const digest = await sha256(file);
  const session = await createUploadSession(agencyId, {
    fileName: file.name,
    contentType,
    size: file.size,
    sha256: digest,
    propertyId: context.propertyId,
    inspectionJobId: context.inspectionJobId,
    reportId: context.reportId,
    areaId: context.areaId,
    componentIds: context.componentIds,
  }, `evidence-${context.reportId}-${digest}`);

  if (session.status === 'duplicate') {
    if (!session.duplicatePhotoId) throw new Error('Duplicate evidence record is incomplete.');
    onProgress?.(100);
    return getPhotoEvidence(agencyId, session.duplicatePhotoId);
  }
  if (!session.resumableUploadUrl) throw new Error('Evidence storage is not configured for this environment.');

  const chunkSize = 8 * 1024 * 1024;
  let uploaded = 0;
  while (uploaded < file.size) {
    uploaded = await uploadChunk(file, session.resumableUploadUrl, uploaded, chunkSize);
    onProgress?.(Math.round((uploaded / file.size) * 100));
  }
  return completeUploadSession(agencyId, session.id, `evidence-complete-${session.id}`);
}
