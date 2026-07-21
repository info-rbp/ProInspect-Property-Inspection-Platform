import { generateId } from '../../utils';
import type { InspectionJob, InspectionJobStatus } from '../../types/platform';
import { apiRequest } from '../apiClient';
import { isFirebaseConfigured } from '../storageService';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreateInspectionJobInput = Omit<InspectionJob, 'id' | 'status' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<InspectionJob, 'status'>>;
type VersionedInspectionJob = InspectionJob & { version?: number };

export const createInspectionJob = async (input: CreateInspectionJobInput): Promise<InspectionJob> => {
  if (isFirebaseConfigured()) {
    return apiRequest<InspectionJob>(input.agencyId, '/api/v1/inspection-jobs', {
      method: 'POST',
      body: { ...input, id: generateId(), status: input.status || 'draft' },
    });
  }
  const timestamp = new Date().toISOString();
  const inspectionJob: InspectionJob = { ...input, id: generateId(), status: input.status || 'draft', createdAt: timestamp, updatedAt: timestamp };
  await localPut('inspectionJobs', inspectionJob);
  return inspectionJob;
};

export const getInspectionJob = async (inspectionJobId: string): Promise<InspectionJob | undefined> => {
  if (isFirebaseConfigured()) {
    try { return await apiRequest<InspectionJob>(undefined, `/api/v1/inspection-jobs/${inspectionJobId}`); } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') return undefined;
      throw error;
    }
  }
  return localGet<InspectionJob>('inspectionJobs', inspectionJobId);
};

export const listInspectionJobs = async (): Promise<InspectionJob[]> => {
  if (isFirebaseConfigured()) return apiRequest<InspectionJob[]>(undefined, '/api/v1/inspection-jobs');
  return localList<InspectionJob>('inspectionJobs');
};

export const updateInspectionJob = async (
  inspectionJobId: string,
  updates: Partial<Omit<InspectionJob, 'id' | 'createdAt'>>,
): Promise<InspectionJob> => {
  const existing = await getInspectionJob(inspectionJobId);
  if (!existing) throw new Error('Inspection job not found.');
  if (isFirebaseConfigured()) {
    return apiRequest<InspectionJob>(existing.agencyId, `/api/v1/inspection-jobs/${inspectionJobId}`, {
      method: 'PATCH',
      body: { ...updates, expectedVersion: (existing as VersionedInspectionJob).version ?? 1 },
    });
  }
  const updatedInspectionJob: InspectionJob = { ...existing, ...updates, id: inspectionJobId, updatedAt: new Date().toISOString() };
  await localPut('inspectionJobs', updatedInspectionJob);
  return updatedInspectionJob;
};

export const assignInspector = async (inspectionJobId: string, assignedInspectorId: string): Promise<InspectionJob> =>
  updateInspectionJob(inspectionJobId, { assignedInspectorId, status: 'assigned' });

export const assignReviewer = async (inspectionJobId: string, assignedReviewerId: string): Promise<InspectionJob> =>
  updateInspectionJob(inspectionJobId, { assignedReviewerId });

export const updateInspectionJobStatus = async (
  inspectionJobId: string,
  status: InspectionJobStatus,
): Promise<InspectionJob> => {
  const existing = await getInspectionJob(inspectionJobId);
  if (!existing) throw new Error('Inspection job not found.');
  if (isFirebaseConfigured()) {
    return apiRequest<InspectionJob>(existing.agencyId, `/api/v1/inspection-jobs/${inspectionJobId}/transitions`, {
      method: 'POST',
      body: { status, expectedVersion: (existing as VersionedInspectionJob).version ?? 1 },
    });
  }
  return updateInspectionJob(inspectionJobId, { status });
};
