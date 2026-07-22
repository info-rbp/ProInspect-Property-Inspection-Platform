import type { UserRole } from './platform.js';

export const SECURITY_CAPABILITIES = [
  'agency.read',
  'agency.manage',
  'user.invite',
  'user.suspend',
  'property.read',
  'property.manage',
  'tenancy.read',
  'tenancy.manage',
  'job.read',
  'job.manage',
  'job.inspect',
  'report.read',
  'report.edit',
  'report.review',
  'report.approve',
  'report.issue',
  'report.finalise',
  'report.archive',
  'template.manage',
  'template.publish',
  'audit.read',
  'maintenance.manage',
  'upload.create',
  'evidence.read_original',
  'evidence.redact',
  'evidence.export',
  'analysis.create',
  'pdf.create',
  'tenant_response.submit',
  'notification.send',
  'maintenance.approve',
  'maintenance.assign',
  'maintenance.close',
  'comparison.review',
  'tenant_invitation.manage',
  'delivery.manage',
  'integration.manage',
  'service_order.manage',
  'portfolio_audit.approve',
] as const;

export type SecurityCapability = (typeof SECURITY_CAPABILITIES)[number];

export interface AuthenticatedPrincipal {
  uid: string;
  email?: string;
  tenantId?: string;
  agencyId: string;
  role: UserRole;
  mfaVerified: boolean;
  sessionId?: string;
  tokenIssuedAt: number;
}

export interface AgencyMembership {
  uid: string;
  agencyId: string;
  role: UserRole;
  status: 'invited' | 'active' | 'suspended' | 'revoked';
  invitationExpiresAt?: string;
  mfaRequired: boolean;
  propertyIds?: string[];
  tenancyIds?: string[];
  inspectionJobIds?: string[];
  reportIds?: string[];
  updatedAt: string;
}

export interface AuthorisationTarget {
  agencyId: string;
  propertyId?: string;
  tenancyId?: string;
  inspectionJobId?: string;
  reportId?: string;
  assignedInspectorId?: string;
  assignedAnalystId?: string;
  assignedReviewerId?: string;
  lifecycleStatus?: string;
}
