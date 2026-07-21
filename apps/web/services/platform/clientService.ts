import { generateId } from '../../utils';
import type { Client } from '../../types/platform';
import { apiRequest } from '../apiClient';
import { isFirebaseConfigured } from '../storageService';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreateClientInput = Omit<Client, 'id' | 'status' | 'createdAt' | 'updatedAt'> & Partial<Pick<Client, 'status'>>;
type VersionedClient = Client & { version?: number };

export const createClient = async (input: CreateClientInput): Promise<Client> => {
  if (isFirebaseConfigured()) {
    return apiRequest<Client>(input.agencyId, '/api/v1/clients', {
      method: 'POST',
      body: { ...input, id: generateId(), status: input.status || 'active' },
    });
  }
  const timestamp = new Date().toISOString();
  const client: Client = { ...input, id: generateId(), status: input.status || 'active', createdAt: timestamp, updatedAt: timestamp };
  await localPut('clients', client);
  return client;
};

export const getClient = async (clientId: string): Promise<Client | undefined> => {
  if (isFirebaseConfigured()) {
    try { return await apiRequest<Client>(undefined, `/api/v1/clients/${clientId}`); } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') return undefined;
      throw error;
    }
  }
  return localGet<Client>('clients', clientId);
};

export const listClients = async (): Promise<Client[]> => {
  if (isFirebaseConfigured()) return apiRequest<Client[]>(undefined, '/api/v1/clients');
  return localList<Client>('clients');
};

export const updateClient = async (clientId: string, updates: Partial<Omit<Client, 'id' | 'createdAt'>>): Promise<Client> => {
  const existing = await getClient(clientId);
  if (!existing) throw new Error('Client not found.');
  if (isFirebaseConfigured()) {
    return apiRequest<Client>(existing.agencyId, `/api/v1/clients/${clientId}`, {
      method: 'PATCH',
      body: { ...updates, expectedVersion: (existing as VersionedClient).version ?? 1 },
    });
  }
  const updatedClient: Client = { ...existing, ...updates, id: clientId, updatedAt: new Date().toISOString() };
  await localPut('clients', updatedClient);
  return updatedClient;
};
