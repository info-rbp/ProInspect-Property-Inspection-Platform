import type { InspectionType } from './platform.js';

export interface SourceDocumentRecord {
  id: string;
  agencyId: string;
  propertyId?: string;
  tenancyId?: string;
  sourceType: 'entry_report' | 'routine_report' | 'exit_report' | 'tenant_amendment' | 'photo_archive' | 'other';
  originalObjectPath: string;
  generation: string;
  sha256: string;
  filename: string;
  contentType: string;
  sourceOrganisation?: string;
  sourceDate?: string;
  status: 'uploaded' | 'processing' | 'ready_for_review' | 'confirmed' | 'rejected' | 'failed';
  createdAt: string;
}

export interface ImportWarning {
  code: string;
  message: string;
  sourceDocumentId?: string;
  candidateId?: string;
}

export interface ImportJobRecord {
  id: string;
  agencyId: string;
  sourceDocumentIds: string[];
  propertyId?: string;
  status: 'queued' | 'extracting' | 'mapping' | 'review_required' | 'confirmed' | 'failed';
  extractorVersion: string;
  mappingVersion: string;
  warnings: ImportWarning[];
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  acceptedCandidateCount?: number;
  materialisedReportId?: string;
  importManifestHash?: string;
}

export interface ImportedFactCandidate {
  id: string;
  importJobId: string;
  sourceDocumentId: string;
  sourceLocator: { page?: number; imageId?: string; boundingBox?: number[] };
  candidateType: 'metadata' | 'area' | 'component' | 'commentary' | 'photo' | 'tenant_amendment';
  extractedValue: unknown;
  amendedValue?: unknown;
  suggestedTargetId?: string;
  confidence: number;
  reviewStatus: 'pending' | 'accepted' | 'amended' | 'rejected';
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface EvidenceIndexRecord {
  id: string;
  agencyId: string;
  propertyId: string;
  tenancyId?: string;
  inspectionJobId?: string;
  reportId?: string;
  reportVersionId?: string;
  areaId?: string;
  componentIds: string[];
  evidenceType: 'photo' | 'video' | 'source_document' | 'final_report' | 'attendance' | 'maintenance_completion';
  purposeTags: string[];
  captureTimestamp?: string;
  inspectionDate?: string;
  availableDerivatives: string[];
  privacyClassification: 'standard' | 'personal' | 'sensitive' | 'redacted';
  retentionClass: string;
  status: 'available' | 'restricted' | 'held' | 'pending_deletion' | 'deleted';
}

export interface CommentaryPhrase {
  id: string;
  agencyId: string;
  shortcut: string;
  text: string;
  inspectionTypes: InspectionType[];
  areaIds?: string[];
  componentIds?: string[];
  conditionCategories?: string[];
  tags: string[];
  status: 'draft' | 'active' | 'retired';
  version: number;
}

export interface SummaryItem {
  id: string;
  areaId?: string;
  componentId?: string;
  evidenceIds: string[];
  text: string;
  priority?: 'critical' | 'high' | 'normal';
}

export interface OwnerSummaryRecord {
  id: string;
  agencyId: string;
  reportId: string;
  reportVersionId: string;
  templateVersion: number;
  status: 'draft' | 'reviewed' | 'approved' | 'issued';
  overallCondition: string;
  keyChanges: SummaryItem[];
  urgentConcerns: SummaryItem[];
  maintenanceRecommendations: SummaryItem[];
  cleaningFollowUp: SummaryItem[];
  unresolvedPriorIssues: SummaryItem[];
  selectedEvidenceIds: string[];
  propertyManagerRecommendation?: string;
}

export interface DeliveryAsset {
  kind: 'report_pdf' | 'owner_summary_pdf' | 'canonical_json' | 'evidence_manifest';
  objectPath: string;
  generation: string;
  sha256: string;
}

export interface DeliveryPackageRecord {
  id: string;
  agencyId: string;
  reportId: string;
  reportVersionId: string;
  recipientType: 'tenant' | 'landlord' | 'client' | 'agency_contact';
  recipientReferenceId?: string;
  recipientEmail?: string;
  assets: DeliveryAsset[];
  tokenHash: string;
  passcodeHash?: string;
  expiresAt: string;
  status: 'draft' | 'queued' | 'sent' | 'opened' | 'downloaded' | 'revoked' | 'expired' | 'failed';
  sentAt?: string;
  openedAt?: string;
  downloadedAt?: string;
}

export interface ExternalReference {
  provider: string;
  connectionId?: string;
  entityType: string;
  externalId: string;
  localId: string;
  lastSyncedAt?: string;
  externalVersion?: string;
}

export type MaintenanceCategory = 'safety' | 'security' | 'water' | 'electrical' | 'appliance' | 'cleaning' | 'building' | 'grounds' | 'other';

export interface MaintenanceItemRecord {
  id: string;
  agencyId: string;
  propertyId: string;
  tenancyId?: string;
  sourceReportId: string;
  sourceReportVersionId: string;
  sourceAreaId: string;
  sourceComponentId: string;
  sourceEvidenceIds: string[];
  observation: string;
  category: MaintenanceCategory;
  operationalPriority: 'critical' | 'high' | 'medium' | 'low' | 'information';
  safetyIndicator: boolean;
  recommendedAction: string;
  suggestedTradeCategory?: string;
  accessRequirements?: string;
  tenantImpact?: string;
  status: 'candidate' | 'approved' | 'awaiting_owner' | 'assigned' | 'in_progress' | 'completed' | 'verified' | 'closed' | 'deferred' | 'cancelled';
  assignedOwnerId?: string;
  targetDate?: string;
  externalWorkOrderReference?: string;
  version: number;
}

export interface ComparisonRunRecord {
  id: string;
  agencyId: string;
  propertyId: string;
  sourceReportId: string;
  sourceVersionId: string;
  targetReportId: string;
  targetVersionId: string;
  mappingVersion: string;
  status: 'queued' | 'matching' | 'suggestions_ready' | 'review_in_progress' | 'approved' | 'failed';
  unmatchedSourceIds: string[];
  unmatchedTargetIds: string[];
}

export interface ComponentComparisonRecord {
  id: string;
  comparisonRunId: string;
  sourceComponentId?: string;
  targetComponentId?: string;
  classification: 'unchanged' | 'improved' | 'cleaned' | 'repaired' | 'replaced' | 'new_wear' | 'deteriorated' | 'new_damage' | 'cleanliness_deterioration' | 'missing' | 'added' | 'configuration_changed' | 'unable_to_compare' | 'insufficient_evidence' | 'review_required';
  sourceEvidenceIds: string[];
  targetEvidenceIds: string[];
  confidence?: number;
  reviewerOutcome?: string;
  reviewStatus: 'pending' | 'accepted' | 'amended' | 'rejected';
}

export interface TenantInvitationRecord {
  id: string;
  agencyId: string;
  tenancyId: string;
  tenantId: string;
  reportId: string;
  reportVersionId: string;
  tokenHash: string;
  expiresAt: string;
  submissionDeadline: string;
  verificationMethod?: 'email_code' | 'passcode' | 'identity_provider';
  status: 'draft' | 'sent' | 'opened' | 'submitted' | 'extended' | 'revoked' | 'expired';
  noResponsePolicyReference?: string;
}

export interface PropertyAccessProfile {
  agencyId: string;
  propertyId: string;
  accessMethod: 'agency_key' | 'lockbox' | 'tenant_present' | 'vacant_unlocked' | 'other';
  instructions: string;
  alarmInstructions?: string;
  petWarnings?: string;
  hazardWarnings?: string;
  privacyClassification: 'restricted';
  version: number;
}

export interface KeyRecord {
  id: string;
  agencyId: string;
  propertyId: string;
  keyCode?: string;
  description: string;
  custodyStatus: 'agency' | 'proinspect' | 'inspector' | 'returned' | 'lost' | 'retired';
}

export interface KeyMovement {
  id: string;
  keyId: string;
  fromCustodian: string;
  toCustodian: string;
  checkedOutAt: string;
  returnedAt?: string;
  acknowledgement?: string;
  exception?: string;
}

export interface CommunicationJob {
  id: string;
  agencyId: string;
  relatedEntityType: string;
  relatedEntityId: string;
  channel: 'email' | 'sms' | 'calendar';
  templateId: string;
  recipientReference: string;
  renderedContentHash: string;
  status: 'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  agencyAuthorisedAt?: string;
}

export interface AgencyBrandingVersion {
  id: string;
  agencyId: string;
  version: number;
  logoEvidenceId?: string;
  primaryColour: string;
  secondaryColour: string;
  contactDetails: Record<string, string>;
  reportFooterText?: string;
  disclaimerTemplateId?: string;
  emailSenderName?: string;
  status: 'draft' | 'published' | 'retired';
  contentHash: string;
}

export interface OfflineInspectionPackage {
  id: string;
  agencyId: string;
  userId: string;
  inspectionJobId: string;
  reportId: string;
  templateId: string;
  templateVersion: number;
  workspaceRevision: number;
  expiresAt: string;
  estimatedBytes: number;
  status: 'preparing' | 'available' | 'downloaded' | 'revoked' | 'expired' | 'purged';
  contentHash: string;
}

export interface ServiceOrderRecord {
  id: string;
  agencyId: string;
  propertyId?: string;
  serviceType: 'report_production' | 'managed_inspection' | 'exit_comparison' | 'maintenance_triage' | 'portfolio_audit' | 'evidence_pack' | 'field_attendance';
  relatedEntityType: string;
  relatedEntityId: string;
  requestedBy: string;
  authorisedBy?: string;
  relatedJobId?: string;
  relatedReportId?: string;
  assignedTeamId?: string;
  region?: string;
  priority: 'standard' | 'priority' | 'urgent' | 'normal' | 'high' | 'critical';
  dueAt?: string;
  status: 'requested' | 'triaged' | 'assigned' | 'in_progress' | 'quality_review' | 'completed' | 'cancelled' | 'failed';
  version: number;
  serviceLevelPolicyId?: string;
  commercialPlanId?: string;
  fairUseClassification?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationConnectionRecord {
  id: string;
  agencyId: string;
  provider: string;
  status: 'draft' | 'authorising' | 'active' | 'paused' | 'expired' | 'degraded' | 'revoked' | 'error';
  credentialSecretRef?: string;
  scopes: string[];
  webhookSecretVersion?: string;
  configuration?: Record<string, unknown>;
  cursor?: string;
  lastSuccessfulSyncAt?: string;
  lastErrorCode?: string;
  version: number;
}

export interface EvidencePackRecord {
  id: string;
  agencyId: string;
  propertyId: string;
  reportVersionIds: string[];
  evidenceIds: string[];
  manifestObjectPath?: string;
  manifestHash?: string;
  requestedBy: string;
  purpose?: string;
  authorisedRequesterId?: string;
  privacyReviewedBy?: string;
  status: 'requested' | 'approved' | 'assembling' | 'ready' | 'revoked' | 'expired' | 'failed';
  expiresAt?: string;
}

export interface FieldAttendanceRecord {
  id: string;
  agencyId: string;
  serviceOrderId: string;
  propertyId: string;
  inspectionJobId?: string;
  attendanceType: 'entry' | 'routine' | 'exit' | 'viewing' | 'access' | 'verification' | 'notice_delivery' | 'occupancy_check';
  scheduledWindowStart: string;
  scheduledWindowEnd: string;
  assignedFieldUserId: string;
  accessAuthorityReference: string;
  status: 'scheduled' | 'travelling' | 'arrived' | 'completed' | 'no_access' | 'unsafe' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  outcomeCode?: string;
  safetyIncidentId?: string;
  version: number;
}

export interface PortfolioAuditFinding {
  id: string;
  propertyId: string;
  category: 'missing_entry' | 'overdue_inspection' | 'maintenance' | 'recurring_observation' | 'evidence_readiness' | 'access_failure' | 'missing_archive' | 'turnaround' | 'key_access' | 'retention';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  supportingReferences: string[];
  recommendedAction: string;
}

export interface PortfolioAuditRunRecord {
  id: string;
  agencyId: string;
  scope: { propertyIds?: string[]; clientIds?: string[]; asAtDate: string };
  ruleVersion: string;
  status: 'queued' | 'processing' | 'review_required' | 'approved' | 'issued' | 'failed';
  findings: PortfolioAuditFinding[];
  createdBy: string;
  approvedBy?: string;
  version: number;
}

export interface AgencyEntitlementRecord {
  id: string;
  agencyId: string;
  feature: string;
  enabled: boolean;
  limit?: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface ServiceAreaRecord {
  id: string;
  agencyId: string;
  name: string;
  postcodes: string[];
  travelPolicyId: string;
  operatingHours: Record<string, string>;
  active: boolean;
}

export interface CapacitySlotRecord {
  id: string;
  agencyId: string;
  serviceAreaId: string;
  fieldUserId: string;
  startAt: string;
  endAt: string;
  capacityUnits: number;
  reservedUnits: number;
}

export interface SubscriptionUsageEventRecord {
  id: string;
  agencyId: string;
  propertyId: string;
  serviceOrderId: string;
  usageType: string;
  units: number;
  occurredAt: string;
  classification: 'included' | 'fair_use_review' | 'additional_fee';
}
