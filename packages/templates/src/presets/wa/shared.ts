import type { InspectionType } from '@pcr/domain';
import type { InspectionTypeTemplate, TemplateArea, TemplateComponent, TemplateComponentRule } from '../../index.js';
import { pcrStandardAreas } from '../../pcrPreset.js';

const ruleFor = (component: TemplateComponent, inspectionType: InspectionType): TemplateComponentRule => {
  const workingStatusRequired = /motor|appliance|oven|stove|fan|light|air.condition|doorbell|hot.water/iu.test(component.name);
  return {
    componentId: component.id,
    required: component.required,
    conditionRequired: true,
    cleanlinessRequired: inspectionType !== 'maintenance',
    workingStatusRequired,
    testMethodRequiredWhenConfirmed: workingStatusRequired,
    minimumEvidence: [
      ...(component.photoRequired ? [{ purpose: 'overview' as const, minimum: 1, waiverAllowed: false }] : []),
      { purpose: 'defect' as const, minimum: 1, waiverAllowed: true },
    ],
    maintenanceExtractionEnabled: true,
  };
};

export function areasFor(inspectionType: InspectionType): TemplateArea[] {
  return structuredClone(pcrStandardAreas).map((area) => ({
    ...area,
    components: area.components.map((component) => ({ ...component, rule: ruleFor(component, inspectionType) })),
  }));
}

export function waTemplate(input: Pick<InspectionTypeTemplate, 'id' | 'inspectionType'> & Partial<InspectionTypeTemplate>): InspectionTypeTemplate {
  const inspectionType = input.inspectionType;
  const reviewerRequired = inspectionType !== 'routine';
  return {
    id: input.id,
    version: input.version ?? 1,
    inspectionType,
    propertyType: 'residential',
    jurisdiction: 'AU-WA',
    effectiveFrom: input.effectiveFrom ?? '2026-07-22',
    furnishingProfile: 'either',
    status: input.status ?? 'published',
    areas: input.areas ?? areasFor(inspectionType),
    commentaryBank: input.commentaryBank ?? [],
    requiredMetadataFields: ['propertyAddress', 'inspectionDate', 'propertyId', 'tenancyId'],
    completionRules: [
      { id: 'required-components', description: 'All required components are assessed.', blocking: true, waiverAllowed: false },
      { id: 'required-evidence', description: 'Required evidence is linked and available.', blocking: true, waiverAllowed: true },
      { id: 'working-claims', description: 'Operational claims identify the test method.', blocking: true, waiverAllowed: false },
    ],
    workflowProfile: {
      analystApprovalRequired: true,
      reviewerApprovalRequired: reviewerRequired,
      reviewerIndependenceRequired: reviewerRequired,
      tenantReview: inspectionType === 'entry' ? 'required' : 'disabled',
    },
    permittedApprovalRoles: ['reviewer', 'property_manager', 'proinspect_admin'],
    comparisonBaselineRequired: inspectionType === 'exit',
    outputLayoutVersion: `wa-${inspectionType}-v1`,
    ownerSummaryLayoutVersion: 'wa-owner-summary-v1',
    brandingCompatibilityVersion: 1,
    sourcePreset: `wa-residential-${inspectionType}-v1`,
    createdAt: input.createdAt ?? '2026-07-22T00:00:00.000Z',
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : { publishedAt: '2026-07-22T00:00:00.000Z' }),
  };
}
