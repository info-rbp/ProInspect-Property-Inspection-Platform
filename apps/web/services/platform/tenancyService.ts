import { generateId } from '../../utils';
import type { Tenancy } from '../../types/platform';
import { apiRequest } from '../apiClient';
import { isFirebaseConfigured } from '../storageService';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreateTenancyInput = Omit<Tenancy, 'id' | 'status' | 'createdAt' | 'updatedAt'> & Partial<Pick<Tenancy, 'status'>>;
type VersionedTenancy = Tenancy & { version?: number };

export const createTenancy = async (input: CreateTenancyInput): Promise<Tenancy> => {
  if (isFirebaseConfigured()) return apiRequest<Tenancy>(input.agencyId, '/api/v1/tenancies', { method: 'POST', body: { ...input, id: generateId(), status: input.status || 'active' }, entityType: 'tenancy', action: 'create', announceSuccess: true });
  const timestamp = new Date().toISOString();
  const tenancy: Tenancy = { ...input, id: generateId(), status: input.status || 'active', createdAt: timestamp, updatedAt: timestamp };
  await localPut('tenancies', tenancy);
  return tenancy;
};

export const getTenancy = async (tenancyId: string): Promise<Tenancy | undefined> => {
  if (isFirebaseConfigured()) {
    try { return await apiRequest<Tenancy>(undefined, `/api/v1/tenancies/${tenancyId}`); }
    catch (error) { if ((error as { code?: string }).code === 'NOT_FOUND') return undefined; throw error; }
  }
  return localGet<Tenancy>('tenancies', tenancyId);
};

export const listTenancies = async (): Promise<Tenancy[]> => isFirebaseConfigured() ? apiRequest<Tenancy[]>(undefined, '/api/v1/tenancies') : localList<Tenancy>('tenancies');

export const updateTenancy = async (tenancyId: string, updates: Partial<Omit<Tenancy, 'id' | 'createdAt'>>): Promise<Tenancy> => {
  const existing = await getTenancy(tenancyId);
  if (!existing) throw new Error('Tenancy not found.');
  if (isFirebaseConfigured()) return apiRequest<Tenancy>(existing.agencyId, `/api/v1/tenancies/${tenancyId}`, { method: 'PATCH', body: { ...updates, expectedVersion: (existing as VersionedTenancy).version ?? 1 }, entityType: 'tenancy', entityId: tenancyId, action: 'update', announceSuccess: true });
  const updated = { ...existing, ...updates, id: tenancyId, updatedAt: new Date().toISOString() };
  await localPut('tenancies', updated);
  return updated;
};
