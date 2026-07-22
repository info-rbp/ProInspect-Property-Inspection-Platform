import type { ReportAggregate } from '@pcr/domain';
import type { InspectionTypeTemplate } from './index.js';

export interface MaterialiseReportInput {
  agencyId: string;
  reportId: string;
  inspectionJobId: string;
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

function reportType(template: InspectionTypeTemplate): string {
  if (template.inspectionType === 'entry') return 'Property Condition Report';
  if (template.inspectionType === 'routine') return 'Routine Inspection';
  if (template.inspectionType === 'exit') return 'Exit Inspection';
  return `${template.inspectionType} inspection`;
}

export function materialisePublishedTemplate(template: InspectionTypeTemplate, input: MaterialiseReportInput): ReportAggregate {
  if (template.status !== 'published' || !template.contentHash) throw new Error('Only a published, content-addressed template can be materialised.');
  if (template.inspectionType === 'exit' && !input.baselineVersionIds?.length) throw new Error('Exit inspection materialisation requires an immutable Entry baseline version.');
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
      propertyId: input.propertyId,
      ...(input.tenancyId ? { tenancyId: input.tenancyId } : {}),
      inspectionJobId: input.inspectionJobId,
      inspectionType: template.inspectionType,
      reportType: reportType(template),
      propertyAddress: input.propertyAddress,
      lifecycleStatus: 'draft',
      ...(input.assignedInspectorId ? { assignedUserId: input.assignedInspectorId } : {}),
      ...(input.assignedAnalystId ? { assignedAnalystId: input.assignedAnalystId } : {}),
      ...(input.assignedReviewerId ? { assignedReviewerId: input.assignedReviewerId } : {}),
      templateId: template.id,
      templateVersion: template.version,
      templateHash: template.contentHash,
      templateAssignment: assignment,
      ...(input.sourceReportIds?.length ? { sourceReportIds: [...input.sourceReportIds] } : {}),
      ...(input.baselineVersionIds?.length ? { baselineVersionIds: [...input.baselineVersionIds] } : {}),
      qualityStatus: 'not_run',
      tenantReviewPolicy: template.workflowProfile?.tenantReview ?? 'disabled',
    },
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
