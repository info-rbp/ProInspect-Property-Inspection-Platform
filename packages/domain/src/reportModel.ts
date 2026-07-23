import type { InspectionType, ReportLifecycleStatus } from './platform.js';

export const COMPONENT_VISIBILITY_STATES = ['visible', 'partially_visible', 'not_visible', 'not_applicable'] as const;
export const COMPONENT_TESTING_METHODS = ['manual_test', 'visual_evidence', 'advised', 'not_tested'] as const;
export const REPORT_QUALITY_STATUSES = ['not_run', 'not_ready', 'ready', 'waived'] as const;
export const REPORT_EVIDENCE_PURPOSES = ['overview', 'context', 'defect', 'testing', 'meter', 'key', 'comparison', 'completion'] as const;

export type ComponentVisibility = (typeof COMPONENT_VISIBILITY_STATES)[number];
export type ComponentTestingMethod = (typeof COMPONENT_TESTING_METHODS)[number];
export type ReportQualityStatus = (typeof REPORT_QUALITY_STATUSES)[number];
export type ReportEvidencePurpose = (typeof REPORT_EVIDENCE_PURPOSES)[number];

export const COMPONENT_CONDITION_CATEGORIES = [
  'not_applicable',
  'not_visible',
  'partially_visible',
  'intact',
  'minor_wear',
  'repair_required',
  'replacement_recommended',
  'unable_to_confirm',
] as const;

export const COMPONENT_CLEANLINESS_CATEGORIES = [
  'not_applicable',
  'clean',
  'requires_cleaning',
  'stained',
  'unable_to_confirm',
] as const;

export const COMPONENT_WORKING_STATUSES = [
  'not_applicable',
  'operation_confirmed',
  'appears_operational',
  'not_working',
  'untested',
  'unable_to_confirm',
] as const;

export const COMPONENT_TEST_STATUSES = [
  'not_applicable',
  'tested_passed',
  'tested_failed',
  'untested',
  'unable_to_confirm',
] as const;

export const COMPONENT_REVIEW_STATUSES = ['draft', 'ai_generated', 'analyst_reviewed', 'reviewer_approved', 'changes_requested'] as const;
export const COMPONENT_COMPARISON_STATUSES = ['not_compared', 'unchanged', 'improved', 'deteriorated', 'new_item', 'missing_item', 'unable_to_compare'] as const;

export type ComponentConditionCategory = (typeof COMPONENT_CONDITION_CATEGORIES)[number];
export type ComponentCleanlinessCategory = (typeof COMPONENT_CLEANLINESS_CATEGORIES)[number];
export type ComponentWorkingStatus = (typeof COMPONENT_WORKING_STATUSES)[number];
export type ComponentTestStatus = (typeof COMPONENT_TEST_STATUSES)[number];
export type ComponentReviewStatus = (typeof COMPONENT_REVIEW_STATUSES)[number];
export type ComponentComparisonStatus = (typeof COMPONENT_COMPARISON_STATUSES)[number];

export interface ReportPhotoReference {
  photoId: string;
  objectPath: string;
  generation?: string;
  sha256?: string;
  thumbnailObjectPath?: string;
  caption?: string;
  sequence?: number;
  purpose?: ReportEvidencePurpose;
  contentType?: string;
}

export interface ReportAssetReference {
  objectPath: string;
  generation: string;
  sha256: string;
  createdAt?: string;
}

export interface ReportTemplateAssignment {
  templateId: string;
  templateVersion: number;
  templateHash: string;
  assignedAt: string;
  assignedBy: string;
  immutable: true;
}

export interface EvidenceLink {
  id: string;
  agencyId: string;
  evidenceId: string;
  reportId: string;
  reportVersionId?: string;
  areaId?: string;
  componentId?: string;
  purpose: ReportEvidencePurpose;
  sequence: number;
  caption?: string;
  createdBy: string;
  createdAt: string;
  version: number;
}

export interface ReportComponentRecord {
  id: string;
  agencyId: string;
  reportId: string;
  areaId: string;
  component: string;
  subComponent?: string;
  material?: string;
  colour?: string;
  type?: string;
  quantity?: number;
  visibility: ComponentVisibility;
  testingMethod?: ComponentTestingMethod;
  conditionCategory: ComponentConditionCategory;
  cleanlinessCategory: ComponentCleanlinessCategory;
  workingStatus: ComponentWorkingStatus;
  testStatus: ComponentTestStatus;
  defects: string[];
  maintenanceRequired: boolean;
  safetyConcern?: boolean;
  maintenanceCandidateIds?: string[];
  commentary: string;
  photoReferences: ReportPhotoReference[];
  aiConfidence?: number;
  reviewStatus: ComponentReviewStatus;
  comparisonStatus: ComponentComparisonStatus;
  sourceComponentId?: string;
  comparisonConfidence?: number;
  tenantResponseId?: string;
  lastReviewedBy?: string;
  lastReviewedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReportAreaRecord {
  id: string;
  agencyId: string;
  reportId: string;
  name: string;
  sequence: number;
  overallCommentary?: string;
  componentCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReportMetadataRecord {
  id: string;
  agencyId: string;
  propertyId?: string;
  tenancyId?: string;
  inspectionJobId?: string;
  inspectionType?: InspectionType;
  reportType: string;
  propertyAddress: string;
  clientName?: string;
  tenantName?: string;
  inspectionDate?: string;
  lifecycleStatus: ReportLifecycleStatus;
  assignedUserId?: string;
  assignedAnalystId?: string;
  assignedReviewerId?: string;
  analystApprovedAt?: string;
  reviewerApprovedAt?: string;
  templateId?: string;
  templateVersion?: number;
  templateHash?: string;
  templateAssignment?: ReportTemplateAssignment;
  sourceReportIds?: string[];
  baselineVersionIds?: string[];
  qualityStatus?: ReportQualityStatus;
  latestQualityRunId?: string;
  workspaceRevision: number;
  schemaVersion: number;
  currentVersionId?: string;
  issueVersionId?: string;
  finalVersionId?: string;
  pdfReference?: ReportAssetReference;
  archiveReference?: ReportAssetReference;
  analysisResultId?: string;
  tenantReviewPolicy?: 'disabled' | 'optional' | 'required';
  tenantReviewDeadline?: string;
  tenantResponseResolvedAt?: string;
  areaCount: number;
  componentCount: number;
  finalisedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ReportVersionRecord {
  id: string;
  agencyId: string;
  reportId: string;
  sequence: number;
  lifecycleStatus: ReportLifecycleStatus;
  areaCount: number;
  componentCount: number;
  contentHash: string;
  createdAt: string;
  createdBy: string;
  workspaceRevision: number;
  templateId?: string;
  templateVersion?: number;
  immutable: true;
}

export interface ReportAggregate {
  report: Omit<ReportMetadataRecord, 'createdAt' | 'updatedAt' | 'version' | 'areaCount' | 'componentCount' | 'workspaceRevision' | 'schemaVersion'> & Partial<Pick<ReportMetadataRecord, 'createdAt' | 'updatedAt' | 'version' | 'workspaceRevision' | 'schemaVersion'>>;
  areas: Array<
    Omit<ReportAreaRecord, 'agencyId' | 'reportId' | 'createdAt' | 'updatedAt' | 'version' | 'componentCount'>
    & Partial<Pick<ReportAreaRecord, 'createdAt' | 'updatedAt' | 'version'>>
    & { components: Array<
      Omit<ReportComponentRecord, 'agencyId' | 'reportId' | 'areaId' | 'createdAt' | 'updatedAt' | 'version'>
      & Partial<Pick<ReportComponentRecord, 'createdAt' | 'updatedAt' | 'version'>>
    > }
  >;
}

export interface ReportReviewRound {
  id: string;
  agencyId: string;
  reportId: string;
  workspaceRevision: number;
  analystId?: string;
  reviewerId?: string;
  analystDecision?: 'approved' | 'changes_requested';
  reviewerDecision?: 'approved' | 'changes_requested';
  outcome: 'in_progress' | 'changes_requested' | 'approved';
  startedAt: string;
  completedAt?: string;
  version: number;
}

export interface ReportReviewComment {
  id: string;
  agencyId: string;
  reportId: string;
  roundId: string;
  areaId?: string;
  componentId?: string;
  evidenceId?: string;
  body: string;
  blocking: boolean;
  status: 'open' | 'resolved';
  createdBy: string;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  version: number;
}

export const IMMUTABLE_REPORT_STATUSES = new Set<ReportLifecycleStatus>(['finalised', 'archived']);
