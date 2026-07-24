import type { Agency, Client, PropertyRecord, Tenancy, UserInvitation, UserProfile, UserRole, UserWorkloadProjection } from '../../types/platform';
import { apiRequest } from '../apiClient';

export const listUsers = (): Promise<UserProfile[]> => apiRequest(undefined, '/api/v1/users');
export const listInvitations = (): Promise<UserInvitation[]> => apiRequest(undefined, '/api/v1/invitations');
export const listWorkload = (): Promise<UserWorkloadProjection[]> => apiRequest(undefined, '/api/v1/administration/workload');
export const listAgencies = (): Promise<Agency[]> => apiRequest(undefined, '/api/v1/agencies');
export const listClients = (): Promise<Client[]> => apiRequest(undefined, '/api/v1/clients');
export const listProperties = (): Promise<PropertyRecord[]> => apiRequest(undefined, '/api/v1/properties');
export const listTenancies = (): Promise<Tenancy[]> => apiRequest(undefined, '/api/v1/tenancies');

export const createInvitation = (email: string, role: UserRole): Promise<UserInvitation> => apiRequest(undefined, '/api/v1/administration/invitations', {
  method: 'POST', body: { email, role }, entityType: 'invitation', action: 'invite', announceSuccess: true,
});

export const commandInvitation = (invitation: UserInvitation, command: 'resend' | 'revoke'): Promise<UserInvitation> => apiRequest(invitation.agencyId, `/api/v1/administration/invitations/${invitation.id}/commands/${command}`, {
  method: 'POST', body: { expectedVersion: invitation.version }, entityType: 'invitation', entityId: invitation.id, action: command, announceSuccess: true,
});

export const commandUser = (user: UserProfile, command: 'change-role' | 'suspend' | 'reactivate' | 'revoke' | 'require-mfa' | 'revoke-sessions', extra: Record<string, unknown> = {}): Promise<UserProfile> => apiRequest(user.agencyId, `/api/v1/administration/users/${user.id}/commands/${command}`, {
  method: 'POST', body: { expectedVersion: user.version ?? 1, ...extra }, entityType: 'user', entityId: user.id, action: command, announceSuccess: true,
});

export const updateAgency = (agency: Agency, patch: Partial<Agency>): Promise<Agency> => apiRequest(agency.id, `/api/v1/agencies/${agency.id}`, {
  method: 'PATCH', body: { ...patch, expectedVersion: agency.version ?? 1 }, entityType: 'agency', entityId: agency.id, action: 'update', announceSuccess: true,
});

export const createClient = (input: Pick<Client, 'agencyId' | 'name' | 'type'> & Partial<Client>): Promise<Client> => apiRequest(input.agencyId, '/api/v1/clients', {
  method: 'POST', body: input, entityType: 'client', action: 'create', announceSuccess: true,
});

export const createTenancy = (input: Omit<Tenancy, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<Tenancy> => apiRequest(input.agencyId, '/api/v1/tenancies', {
  method: 'POST', body: input, entityType: 'tenancy', action: 'create', announceSuccess: true,
});

export const commandTenancy = (tenancy: Tenancy, command: 'activate' | 'end'): Promise<Tenancy> => apiRequest(tenancy.agencyId, `/api/v1/administration/tenancies/${tenancy.id}/commands/${command}`, {
  method: 'POST', body: { expectedVersion: tenancy.version ?? 1 }, entityType: 'tenancy', entityId: tenancy.id, action: command, announceSuccess: true,
});

export const commandProperty = (property: PropertyRecord, command: 'archive' | 'restore'): Promise<PropertyRecord> => apiRequest(property.agencyId, `/api/v1/administration/properties/${property.id}/commands/${command}`, {
  method: 'POST', body: { expectedVersion: property.version ?? 1 }, entityType: 'property', entityId: property.id, action: command, announceSuccess: true,
});
