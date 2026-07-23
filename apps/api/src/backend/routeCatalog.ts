import type { AuthorisationTarget } from '@pcr/domain';
import type { RoutePolicy } from './types.js';

function target(body: Record<string, unknown>, id?: string): AuthorisationTarget {
  const agencyId = typeof body.agencyId === 'string' ? body.agencyId : '';
  return {
    agencyId,
    ...(typeof body.propertyId === 'string' ? { propertyId: body.propertyId } : {}),
    ...(typeof body.tenancyId === 'string' ? { tenancyId: body.tenancyId } : {}),
    ...(typeof body.inspectionJobId === 'string' ? { inspectionJobId: body.inspectionJobId } : {}),
    ...(typeof body.reportId === 'string' ? { reportId: body.reportId } : {}),
    ...(typeof body.assignedInspectorId === 'string' ? { assignedInspectorId: body.assignedInspectorId } : {}),
    ...(typeof body.assignedAnalystId === 'string' ? { assignedAnalystId: body.assignedAnalystId } : {}),
    ...(typeof body.assignedReviewerId === 'string' ? { assignedReviewerId: body.assignedReviewerId } : {}),
    ...(typeof body.lifecycleStatus === 'string' ? { lifecycleStatus: body.lifecycleStatus } : {}),
    ...(!body.reportId && id ? { reportId: id } : {}),
  };
}

export const ROUTE_POLICIES: Record<string, RoutePolicy> = {
  agencies: { collection: 'agencies', readCapability: 'agency.read', writeCapability: 'agency.manage', target },
  users: { collection: 'users', readCapability: 'agency.read', writeCapability: 'user.suspend', target },
  invitations: { collection: 'invitations', readCapability: 'agency.read', writeCapability: 'user.invite', target },
  clients: { collection: 'clients', readCapability: 'property.read', writeCapability: 'property.manage', target },
  properties: { collection: 'properties', readCapability: 'property.read', writeCapability: 'property.manage', target },
  tenancies: { collection: 'tenancies', readCapability: 'tenancy.read', writeCapability: 'tenancy.manage', target },
  'inspection-jobs': { collection: 'inspectionJobs', readCapability: 'job.read', writeCapability: 'job.manage', target },
  reports: { collection: 'reports', readCapability: 'report.read', writeCapability: 'report.edit', target },
  templates: { collection: 'templates', readCapability: 'report.read', writeCapability: 'template.manage', target },
  'report-versions': { collection: 'reportVersions', readCapability: 'report.read', writeCapability: 'report.edit', target },
  uploads: { collection: 'uploadSessions', readCapability: 'report.read', writeCapability: 'upload.create', target },
  'photo-evidence': { collection: 'photoEvidence', readCapability: 'report.read', target },
  'analysis-jobs': { collection: 'analysisJobs', readCapability: 'report.read', writeCapability: 'analysis.create', target },
  'analysis-results': { collection: 'analysisResults', readCapability: 'report.read', target },
  'pdf-jobs': { collection: 'pdfJobs', readCapability: 'report.read', writeCapability: 'pdf.create', target },
  'tenant-responses': { collection: 'tenantResponses', readCapability: 'report.read', writeCapability: 'tenant_response.submit', target },
  notifications: { collection: 'notificationJobs', readCapability: 'audit.read', writeCapability: 'notification.send', target },
  'audit-history': { collection: 'auditEvents', readCapability: 'audit.read', target },
  'work-queue': { collection: 'workQueueItems', readCapability: 'job.read', target },
  'source-documents': { collection: 'sourceDocuments', readCapability: 'report.read', writeCapability: 'evidence.export', target },
  'import-jobs': { collection: 'importJobs', readCapability: 'report.read', writeCapability: 'integration.manage', target },
  'import-candidates': { collection: 'importCandidates', readCapability: 'report.read', writeCapability: 'integration.manage', target },
  'evidence-index': { collection: 'evidenceIndex', readCapability: 'report.read', writeCapability: 'evidence.export', target },
  'commentary-phrases': { collection: 'commentaryPhrases', readCapability: 'report.read', writeCapability: 'template.manage', target },
  'owner-summaries': { collection: 'ownerSummaries', readCapability: 'report.read', writeCapability: 'report.review', target },
  deliveries: { collection: 'deliveryPackages', readCapability: 'report.read', writeCapability: 'delivery.manage', target },
  'external-references': { collection: 'externalReferences', readCapability: 'property.read', writeCapability: 'integration.manage', target },
  'maintenance-items': { collection: 'maintenanceItems', readCapability: 'report.read', writeCapability: 'maintenance.manage', target },
  'comparison-runs': { collection: 'comparisonRuns', readCapability: 'report.read', writeCapability: 'comparison.review', target },
  'component-comparisons': { collection: 'componentComparisons', readCapability: 'report.read', writeCapability: 'comparison.review', target },
  'tenant-invitations': { collection: 'tenantInvitations', readCapability: 'report.read', writeCapability: 'tenant_invitation.manage', target },
  'access-profiles': { collection: 'accessProfiles', readCapability: 'job.read', writeCapability: 'job.manage', target },
  keys: { collection: 'keys', readCapability: 'job.read', writeCapability: 'job.manage', target },
  'key-movements': { collection: 'keyMovements', readCapability: 'job.read', writeCapability: 'job.manage', target },
  communications: { collection: 'communicationJobs', readCapability: 'audit.read', writeCapability: 'notification.send', target },
  'branding-versions': { collection: 'brandingVersions', readCapability: 'agency.read', writeCapability: 'agency.manage', target },
  'offline-packages': { collection: 'offlinePackages', readCapability: 'job.read', writeCapability: 'job.inspect', target },
  'service-orders': { collection: 'serviceOrders', readCapability: 'job.read', writeCapability: 'service_order.manage', target },
  'field-attendances': { collection: 'fieldAttendances', readCapability: 'job.read', writeCapability: 'service_order.manage', target },
  'integration-connections': { collection: 'integrationConnections', readCapability: 'agency.read', writeCapability: 'integration.manage', target },
  'evidence-packs': { collection: 'evidencePacks', readCapability: 'audit.read', writeCapability: 'evidence.export', target },
  'portfolio-audits': { collection: 'portfolioAudits', readCapability: 'audit.read', writeCapability: 'portfolio_audit.approve', target },
  entitlements: { collection: 'entitlements', readCapability: 'agency.read', writeCapability: 'agency.manage', target },
  'service-areas': { collection: 'serviceAreas', readCapability: 'agency.read', writeCapability: 'service_order.manage', target },
  'capacity-slots': { collection: 'capacitySlots', readCapability: 'job.read', writeCapability: 'service_order.manage', target },
  'subscription-usage': { collection: 'subscriptionUsageEvents', readCapability: 'audit.read', writeCapability: 'service_order.manage', target },
};

export const API_ROUTE_NAMES = Object.freeze(Object.keys(ROUTE_POLICIES));
