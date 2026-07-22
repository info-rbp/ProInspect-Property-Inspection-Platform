import { generateId } from '../../utils';
import type { PropertyRecord } from '../../types/platform';
import { apiRequest } from '../apiClient';
import { isFirebaseConfigured } from '../storageService';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreatePropertyInput = Omit<PropertyRecord, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'clientIds'> &
  Partial<Pick<PropertyRecord, 'clientIds' | 'status'>>;

type VersionedProperty = PropertyRecord & { version?: number };

export const createProperty = async (input: CreatePropertyInput): Promise<PropertyRecord> => {
  const propertyId = generateId();
  if (isFirebaseConfigured()) {
    return apiRequest<PropertyRecord>(input.agencyId, '/api/v1/properties', {
      method: 'POST',
      body: { ...input, id: propertyId, clientIds: input.clientIds || [], status: input.status || 'active' },
      dirtyScopeId: 'property:new',
      entityType: 'property',
      entityId: propertyId,
      action: 'create',
      queueWhenOffline: true,
      announceSuccess: true,
    });
  }
  const timestamp = new Date().toISOString();
  const property: PropertyRecord = { ...input, id: propertyId, clientIds: input.clientIds || [], status: input.status || 'active', createdAt: timestamp, updatedAt: timestamp };
  await localPut('properties', property, { dirtyScopeId: 'property:new', entityType: 'property', entityId: propertyId, action: 'create', announceSuccess: true });
  return property;
};

export const getProperty = async (propertyId: string): Promise<PropertyRecord | undefined> => {
  if (isFirebaseConfigured()) {
    try { return await apiRequest<PropertyRecord>(undefined, `/api/v1/properties/${propertyId}`); } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') return undefined;
      throw error;
    }
  }
  return localGet<PropertyRecord>('properties', propertyId);
};

export const listProperties = async (): Promise<PropertyRecord[]> => {
  if (isFirebaseConfigured()) return apiRequest<PropertyRecord[]>(undefined, '/api/v1/properties');
  return localList<PropertyRecord>('properties');
};

export const updateProperty = async (propertyId: string, updates: Partial<Omit<PropertyRecord, 'id' | 'createdAt'>>): Promise<PropertyRecord> => {
  const existing = await getProperty(propertyId);
  if (!existing) throw new Error('Property not found.');
  if (isFirebaseConfigured()) {
    return apiRequest<PropertyRecord>(existing.agencyId, `/api/v1/properties/${propertyId}`, {
      method: 'PATCH',
      body: { ...updates, expectedVersion: (existing as VersionedProperty).version ?? 1 },
      baseVersion: (existing as VersionedProperty).version ?? 1,
      dirtyScopeId: `property:${propertyId}`,
      entityType: 'property',
      entityId: propertyId,
      action: 'update',
      queueWhenOffline: true,
      announceSuccess: true,
    });
  }
  const updatedProperty: PropertyRecord = { ...existing, ...updates, id: propertyId, updatedAt: new Date().toISOString() };
  await localPut('properties', updatedProperty, { dirtyScopeId: `property:${propertyId}`, entityType: 'property', entityId: propertyId, action: 'update', announceSuccess: true });
  return updatedProperty;
};

export const archiveProperty = async (propertyId: string): Promise<PropertyRecord> => updateProperty(propertyId, { status: 'archived' });
