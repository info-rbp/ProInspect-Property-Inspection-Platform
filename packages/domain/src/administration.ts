import type { UserRole } from './platform.js';

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'revoked'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const INVITATION_STATUSES = ['draft', 'sent', 'accepted', 'expired', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface UserInvitation {
  id: string;
  agencyId: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  expiresAt: string;
  invitedBy: string;
  acceptedByUid?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyMembership {
  id: string;
  uid: string;
  agencyId: string;
  email: string;
  displayName?: string;
  role: UserRole;
  status: MembershipStatus;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  lastSessionRevokedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserWorkloadProjection {
  userId: string;
  activeJobs: number;
  overdueJobs: number;
  reportsAwaitingAction: number;
  nextAssignmentAt?: string;
  unavailableUntil?: string;
  conflictingAssignmentIds: string[];
}

export interface AgencyConfiguration {
  timezone: string;
  jurisdiction: string;
  reportSenderName?: string;
  reportSenderEmail?: string;
  defaultInspectionDurationMinutes?: number;
  retentionPolicyId?: string;
  brandingVersionId?: string;
}
