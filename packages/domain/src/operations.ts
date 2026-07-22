export interface OutboxEvent {
  id: string;
  agencyId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: Record<string, unknown>;
  correlationId: string;
  status: 'pending' | 'publishing' | 'published' | 'failed' | 'dead_lettered';
  attempt: number;
  availableAt: string;
  createdAt: string;
}

export interface WorkQueueItem {
  id: string;
  agencyId: string;
  entityType: 'inspection_job' | 'report' | 'analysis_job' | 'pdf_job' | 'upload' | 'delivery';
  entityId: string;
  propertyId?: string;
  propertyAddress?: string;
  reportType?: string;
  stage: string;
  assignedUserIds: string[];
  priority: 'normal' | 'high' | 'critical';
  dueAt?: string;
  blockedReason?: string;
  exceptionCode?: string;
  nextAction: string;
  correlationId?: string;
  updatedAt: string;
}

export interface AgencyEntitlement {
  agencyId: string;
  feature: string;
  enabled: boolean;
  limit?: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export const PLATFORM_FEATURES = [
  'core.report_workspace_v2',
  'core.server_workflow',
  'core.server_pdf',
  'commercial.previous_report_import',
  'commercial.evidence_vault',
  'commercial.secure_delivery',
  'operations.maintenance',
  'operations.comparison',
  'operations.tenant_review',
  'operations.offline_package',
  'scale.direct_integrations',
  'scale.service_operations',
  'scale.white_label',
] as const;

export type PlatformFeature = (typeof PLATFORM_FEATURES)[number];
