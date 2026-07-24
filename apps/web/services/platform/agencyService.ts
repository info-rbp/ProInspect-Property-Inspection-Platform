import { generateId } from '../../utils';
import type { Agency } from '../../types/platform';
import { apiRequest } from '../apiClient';
import { isFirebaseConfigured } from '../storageService';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreateAgencyInput = Omit<Agency, 'id' | 'status' | 'createdAt' | 'updatedAt'> & Partial<Pick<Agency, 'status'>>;
type VersionedAgency = Agency & { version?: number };

export const createAgency = async (input: CreateAgencyInput): Promise<Agency> => {
  if (isFirebaseConfigured()) return apiRequest<Agency>(undefined, '/api/v1/agencies', { method: 'POST', body: { ...input, id: generateId(), status: input.status || 'active' }, entityType: 'agency', action: 'create', announceSuccess: true });
  const timestamp = new Date().toISOString();
  const agency: Agency = { ...input, id: generateId(), status: input.status || 'active', createdAt: timestamp, updatedAt: timestamp };
  await localPut('agencies', agency);
  return agency;
};

export const getAgency = async (agencyId: string): Promise<Agency | undefined> => {
  if (isFirebaseConfigured()) {
    try { return await apiRequest<Agency>(agencyId, `/api/v1/agencies/${agencyId}`); }
    catch (error) { if ((error as { code?: string }).code === 'NOT_FOUND') return undefined; throw error; }
  }
  return localGet<Agency>('agencies', agencyId);
};

export const listAgencies = async (): Promise<Agency[]> => isFirebaseConfigured() ? apiRequest<Agency[]>(undefined, '/api/v1/agencies') : localList<Agency>('agencies');

export const updateAgency = async (agencyId: string, updates: Partial<Omit<Agency, 'id' | 'createdAt'>>): Promise<Agency> => {
  const existing = await getAgency(agencyId);
  if (!existing) throw new Error('Agency not found.');
  if (isFirebaseConfigured()) return apiRequest<Agency>(agencyId, `/api/v1/agencies/${agencyId}`, { method: 'PATCH', body: { ...updates, expectedVersion: (existing as VersionedAgency).version ?? 1 }, entityType: 'agency', entityId: agencyId, action: 'update', announceSuccess: true });
  const updated = { ...existing, ...updates, id: agencyId, updatedAt: new Date().toISOString() };
  await localPut('agencies', updated);
  return updated;
};
