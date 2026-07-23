import { generateId } from '../../utils';
import type { InspectionJob, InspectionJobStatus } from '../../types/platform';
import { apiRequest } from '../apiClient';
import { isFirebaseConfigured } from '../storageService';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreateInspectionJobInput = Omit<InspectionJob, 'id' | 'status' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<InspectionJob, 'status'>>;
export interface BookInspectionJobInput {
  agencyId: string;
  propertyId: string;
  tenancyId?: string;
  inspectionType: 'entry' | 'routine' | 'exit';
  scheduledAt: string;
  templateId: string;
  templateVersion: number;
  sourceReportIds: string[];
  baselineVersionIds?: string[];
  assignedInspectorId?: string;
  assignedReviewerId?: string;
  accessInstructions?: Record<string, unknown>;
}

export interface BookingResult {
  jobId: string;
  reportId: string;
  assignmentId: string;
  jobVersion: number;
  reportVersion: number;
  workspaceRevision: number;
}
type VersionedInspectionJob = InspectionJob & { version?: number };

export type InspectionJobCommand =
  | 'assign'
  | 'reassign'
  | 'reschedule'
  | 'start-inspection'
  | 'begin-photo-upload'
  | 'complete-photo-upload'
  | 'submit-fieldwork'
  | 'hold'
  | 'resume'
  | 'record-no-access'
  | 'record-unsafe'
  | 'cancel'
  | 'reopen';

export const createInspectionJob = async (input: CreateInspectionJobInput): Promise<InspectionJob> => {
  const inspectionJobId = generateId();
  if (isFirebaseConfigured()) {
    return apiRequest<InspectionJob>(input.agencyId, '/api/v1/inspection-jobs', {
      method: 'POST',
      body: { ...input, id: inspectionJobId, status: input.status || 'draft' },
      dirtyScopeId: 'job:new',
      entityType: 'job',
      entityId: inspectionJobId,
      action: 'create',
      queueWhenOffline: true,
      announceSuccess: true,
    });
  }
  const timestamp = new Date().toISOString();
  const inspectionJob: InspectionJob = { ...input, id: inspectionJobId, status: input.status || 'draft', createdAt: timestamp, updatedAt: timestamp };
  await localPut('inspectionJobs', inspectionJob, { dirtyScopeId: 'job:new', entityType: 'job', entityId: inspectionJobId, action: 'create', announceSuccess: true });
  return inspectionJob;
};

export const bookInspectionJob = async (input: BookInspectionJobInput): Promise<BookingResult> => {
  if (!isFirebaseConfigured()) {
    const reportType = input.inspectionType === 'entry' ? 'Property Condition Report' : input.inspectionType === 'routine' ? 'Routine Inspection' : 'Exit Inspection';
    const job = await createInspectionJob({
      agencyId: input.agencyId, propertyId: input.propertyId, ...(input.tenancyId ? { tenancyId: input.tenancyId } : {}),
      reportType, scheduledAt: input.scheduledAt, ...(input.assignedInspectorId ? { assignedInspectorId: input.assignedInspectorId } : {}),
      ...(input.assignedReviewerId ? { assignedReviewerId: input.assignedReviewerId } : {}), status: input.assignedInspectorId ? 'assigned' : 'booked',
    });
    return { jobId: job.id, reportId: `local-report-${job.id}`, assignmentId: `local-assignment-${job.id}`, jobVersion: 1, reportVersion: 1, workspaceRevision: 1 };
  }
  return apiRequest<BookingResult>(input.agencyId, '/api/v1/inspection-jobs/commands/book', {
    method: 'POST', body: input, dirtyScopeId: 'job:new', entityType: 'job', action: 'book', announceSuccess: true,
  });
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
      baseVersion: (existing as VersionedInspectionJob).version ?? 1,
      dirtyScopeId: `job:${inspectionJobId}`,
      entityType: 'job',
      entityId: inspectionJobId,
      action: 'update',
      queueWhenOffline: true,
      announceSuccess: true,
    });
  }
  const updatedInspectionJob: InspectionJob = { ...existing, ...updates, id: inspectionJobId, updatedAt: new Date().toISOString() };
  await localPut('inspectionJobs', updatedInspectionJob, { dirtyScopeId: `job:${inspectionJobId}`, entityType: 'job', entityId: inspectionJobId, action: 'update', announceSuccess: true });
  return updatedInspectionJob;
};

export const runInspectionJobCommand = async (
  inspectionJobId: string,
  command: InspectionJobCommand,
  body: Record<string, unknown> = {},
): Promise<InspectionJob> => {
  const existing = await getInspectionJob(inspectionJobId);
  if (!existing) throw new Error('Inspection job not found.');
  if (!isFirebaseConfigured()) {
    const localTargets: Partial<Record<InspectionJobCommand, InspectionJobStatus>> = {
      assign: 'assigned', 'start-inspection': 'inspection_started', 'begin-photo-upload': 'photos_uploading',
      'complete-photo-upload': 'photos_uploaded', 'submit-fieldwork': 'inspection_submitted', hold: 'on_hold',
      'record-no-access': 'on_hold', 'record-unsafe': 'on_hold', cancel: 'cancelled', reopen: 'draft',
    };
    const status = command === 'resume' ? body.resumeStatus as InspectionJobStatus : localTargets[command] ?? existing.status;
    return updateInspectionJob(inspectionJobId, { ...body, status });
  }
  const expectedVersion = (existing as VersionedInspectionJob).version ?? 1;
  return apiRequest<InspectionJob>(existing.agencyId, `/api/v1/inspection-jobs/${encodeURIComponent(inspectionJobId)}/commands/${command}`, {
    method: 'POST', body: { ...body, expectedVersion }, baseVersion: expectedVersion,
    entityType: 'job', entityId: inspectionJobId, action: command, announceSuccess: true, queueWhenOffline: false,
  });
};

export const assignInspector = async (inspectionJobId: string, assignedInspectorId: string): Promise<InspectionJob> =>
  runInspectionJobCommand(inspectionJobId, 'reassign', { assignedInspectorId, reason: 'Inspector assigned by operator.' });

export const assignReviewer = async (inspectionJobId: string, assignedReviewerId: string): Promise<InspectionJob> =>
  runInspectionJobCommand(inspectionJobId, 'reassign', { assignedReviewerId, reason: 'Reviewer assigned by operator.' });

export const updateInspectionJobStatus = async (
  inspectionJobId: string,
  status: InspectionJobStatus,
): Promise<InspectionJob> => {
  const mapping: Partial<Record<InspectionJobStatus, { command: InspectionJobCommand; body?: Record<string, unknown> }>> = {
    assigned: { command: 'assign' },
    inspection_started: { command: 'start-inspection' },
    photos_uploading: { command: 'begin-photo-upload' },
    photos_uploaded: { command: 'complete-photo-upload' },
    inspection_submitted: { command: 'submit-fieldwork' },
    on_hold: { command: 'hold', body: { reason: 'Placed on hold by operator.' } },
    cancelled: { command: 'cancel', body: { reason: 'Cancelled by operator.' } },
    draft: { command: 'reopen', body: { reason: 'Reopened by operator.' } },
  };
  const mapped = mapping[status];
  if (!mapped) throw new Error(`Status ${status} must be changed by its owning report workflow.`);
  return runInspectionJobCommand(inspectionJobId, mapped.command, mapped.body);
};
