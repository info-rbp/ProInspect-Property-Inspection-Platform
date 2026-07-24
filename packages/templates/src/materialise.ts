import type { ReportAggregate, ReportOrigin } from '@pcr/domain';
import type { InspectionTypeTemplate } from './index.js';

export interface MaterialiseReportInput {
  agencyId: string;
  reportId: string;
  inspectionJobId: string;
  bookingCommandId?: string;
  propertyId: string;
  propertyAddress: string;
  tenancyId?: string;
  assignedInspectorId?: string;
  assignedAnalystId?: string;
  assignedReviewerId?: string;
  assignedAt: string;
  assignedBy: string;
  sourceReportIds?: string[];
  baselineVersionIds?: string[];
}

export interface MaterialiseExceptionalReportInput {
  agencyId: string;
  reportId: string;
  propertyId: string;
  propertyAddress: string;
  tenancyId?: string;
  assignedAt: string;
  assignedBy: string;
  origin: Exclude<ReportOrigin, 'inspection_booking'>;
  reportType: string;
  reasonCode: string;
  reason: string;
  sourceReportIds?: string[];
  sourceDocumentIds?: string[];
}

function reportType(template: InspectionTypeTemplate): string {
  if (template.inspectionType === 'entry') return 'Property Condition Report';
  if (template.inspectionType === 'routine') return 'Routine Inspection';
  if (template.inspectionType === 'exit') return 'Exit Inspection';
  return `${template.inspectionType} inspection`;
}

function baseAggregate(template: InspectionTypeTemplate, input: {
  agencyId: string;
  reportId: string;
  propertyId: string;
  propertyAddress: string;
  tenancyId?: string;
  assignedAt: string;
  assignedBy: string;
  origin: ReportOrigin;
  reportType: string;
}): ReportAggregate {
  if (template.status !== 'published' || !template.contentHash) throw new Error('Only a published, content-addressed template can be materialised.');
  const assignment = {
    templateId: template.id,
    templateVersion: template.version,
    templateHash: template.contentHash,
    assignedAt: input.assignedAt,
    assignedBy: input.assignedBy,
    immutable: true as const,
  };
  return {
    report: {
      id: input.reportId,
      agencyId: input.agencyId,
      origin: input.origin,
      propertyId: input.propertyId,
      ...(input.tenancyId ? { tenancyId: input.tenancyId } : {}),
      inspectionType: template.inspectionType,
      reportType: input.reportType,
      propertyAddress: input.propertyAddress,
      lifecycleStatus: 'draft',
      templateId: template.id,
      templateVersion: template.version,
      templateHash: template.contentHash,
      templateAssignment: assignment,
      createdBy: input.assignedBy,
      createdAt: input.assignedAt,
      qualityStatus: 'not_run',
      tenantReviewPolicy: template.workflowProfile?.tenantReview ?? 'disabled',
    } as ReportAggregate['report'],
    areas: template.areas.map((area, areaIndex) => ({
      id: area.id,
      name: area.name,
      sequence: areaIndex + 1,
      components: area.components.map((component) => ({
        id: component.id,
        component: component.name,
        visibility: 'visible',
        testingMethod: 'not_tested',
        conditionCategory: 'unable_to_confirm',
        cleanlinessCategory: 'unable_to_confirm',
        workingStatus: 'untested',
        testStatus: 'untested',
        defects: [],
        maintenanceRequired: false,
        commentary: '',
        photoReferences: [],
        reviewStatus: 'draft',
        comparisonStatus: 'not_compared',
      })),
    })),
  };
}

export function materialisePublishedTemplate(template: InspectionTypeTemplate, input: MaterialiseReportInput): ReportAggregate {
  if (template.inspectionType === 'exit' && !input.baselineVersionIds?.length) throw new Error('Exit inspection materialisation requires an immutable Entry baseline version.');
  const aggregate = baseAggregate(template, {
    ...input,
    origin: 'inspection_booking',
    reportType: reportType(template),
  });
  aggregate.report.inspectionJobId = input.inspectionJobId;
  Object.assign(aggregate.report, { bookingCommandId: input.bookingCommandId ?? input.reportId });
  if (input.assignedInspectorId) aggregate.report.assignedUserId = input.assignedInspectorId;
  if (input.assignedAnalystId) aggregate.report.assignedAnalystId = input.assignedAnalystId;
  if (input.assignedReviewerId) aggregate.report.assignedReviewerId = input.assignedReviewerId;
  if (input.sourceReportIds?.length) aggregate.report.sourceReportIds = [...input.sourceReportIds];
  if (input.baselineVersionIds?.length) aggregate.report.baselineVersionIds = [...input.baselineVersionIds];
  return aggregate;
}

export function materialiseExceptionalReport(template: InspectionTypeTemplate, input: MaterialiseExceptionalReportInput): ReportAggregate {
  const aggregate = baseAggregate(template, input);
  Object.assign(aggregate.report, {
    exceptionalReasonCode: input.reasonCode,
    exceptionalReason: input.reason,
    ...(input.sourceReportIds?.length ? { sourceReportIds: [...input.sourceReportIds] } : {}),
    ...(input.sourceDocumentIds?.length ? { sourceDocumentIds: [...input.sourceDocumentIds] } : {}),
  });
  return aggregate;
}
