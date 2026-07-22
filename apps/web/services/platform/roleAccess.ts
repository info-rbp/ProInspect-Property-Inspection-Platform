import type { UserRole } from '../../types/platform';

export const INTERNAL_ROLES: UserRole[] = [
  'super_admin',
  'proinspect_admin',
  'operations',
  'inspector',
  'analyst',
  'reviewer',
];

export type InternalSection =
  | 'dashboard'
  | 'properties'
  | 'jobs'
  | 'reports'
  | 'users'
  | 'templates'
  | 'operations'
  | 'settings';

const ROLE_SECTIONS: Record<UserRole, InternalSection[]> = {
  super_admin: ['dashboard', 'properties', 'jobs', 'reports', 'users', 'templates', 'operations', 'settings'],
  proinspect_admin: ['dashboard', 'properties', 'jobs', 'reports', 'users', 'templates', 'operations', 'settings'],
  operations: ['dashboard', 'properties', 'jobs', 'reports', 'operations'],
  property_manager: ['dashboard', 'properties', 'jobs', 'reports', 'operations'],
  maintenance_coordinator: ['dashboard', 'properties', 'jobs', 'reports', 'operations'],
  inspector: ['dashboard'],
  analyst: ['dashboard', 'reports'],
  reviewer: ['dashboard', 'reports'],
  tenant: [],
  landlord: [],
  shopify_customer: [],
};

export const isInternalRole = (role?: UserRole): boolean => Boolean(role && INTERNAL_ROLES.includes(role));

export const canAccessSection = (role: UserRole | undefined, section: InternalSection): boolean => {
  if (!role) {
    return false;
  }

  return ROLE_SECTIONS[role].includes(section);
};

export const hasAnyRole = (currentRole: UserRole | undefined, allowedRoles: UserRole[]): boolean => {
  if (!currentRole) {
    return false;
  }

  return allowedRoles.includes(currentRole);
};
