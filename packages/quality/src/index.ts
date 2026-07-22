import type { EvidenceLink, ReportAggregate, ReportReviewComment } from '@pcr/domain';
import type { InspectionTypeTemplate, TemplateComponentRule } from '@pcr/templates';

export type QualitySeverity = 'info' | 'warning' | 'error';
export type QualityStage = 'field_submission' | 'analyst_completion' | 'reviewer_approval' | 'finalisation' | 'archive';

export interface QualityRuleResult {
  ruleId: string;
  severity: QualitySeverity;
  blocking: boolean;
  message: string;
  remediation: string;
  areaId?: string;
  componentId?: string;
  evidenceId?: string;
  waiverEligible: boolean;
}

export interface QualityWaiver {
  ruleId: string;
  areaId?: string;
  componentId?: string;
  actorId: string;
  reason: string;
  waivedAt: string;
}

export interface QualityRun {
  id: string;
  reportId: string;
  workspaceRevision: number;
  templateId?: string;
  templateVersion?: number;
  ruleSetVersion: 'phase-1.0';
  stage: QualityStage;
  status: 'ready' | 'not_ready';
  score: number;
  results: QualityRuleResult[];
  waivers: QualityWaiver[];
  contentHash: string;
  createdAt: string;
}

export interface QualityContext {
  aggregate: ReportAggregate;
  template?: InspectionTypeTemplate;
  evidenceLinks?: EvidenceLink[];
  evidenceStatuses?: Record<string, 'available' | 'uploading' | 'failed' | 'rejected'>;
  openReviewComments?: ReportReviewComment[];
  analystId?: string;
  reviewerId?: string;
  stage: QualityStage;
  waivers?: QualityWaiver[];
  now?: string;
}

const makeResult = (
  ruleId: string,
  message: string,
  remediation: string,
  location: Pick<QualityRuleResult, 'areaId' | 'componentId' | 'evidenceId'> = {},
  options: { severity?: QualitySeverity; blocking?: boolean; waiverEligible?: boolean } = {},
): QualityRuleResult => ({
  ruleId,
  severity: options.severity ?? 'error',
  blocking: options.blocking ?? true,
  waiverEligible: options.waiverEligible ?? false,
  message,
  remediation,
  ...location,
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function deterministicHash(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const char of canonical(value)) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function componentRule(template: InspectionTypeTemplate | undefined, areaId: string, componentId: string): TemplateComponentRule | undefined {
  const area = template?.areas.find((candidate) => candidate.id === areaId);
  const component = area?.components.find((candidate) => candidate.id === componentId);
  return component?.rule;
}

function hasEvidence(context: QualityContext, areaId: string, componentId: string, purposes?: string[]): boolean {
  const explicit = context.evidenceLinks?.some((link) =>
    link.areaId === areaId && link.componentId === componentId && (!purposes?.length || purposes.includes(link.purpose)),
  );
  if (explicit) return true;
  const component = context.aggregate.areas.find((area) => area.id === areaId)?.components.find((item) => item.id === componentId);
  return Boolean(component?.photoReferences.length);
}

export function runQualityCheck(context: QualityContext): QualityRun {
  const { aggregate } = context;
  const results: QualityRuleResult[] = [];
  const report = aggregate.report;

  if (!report.propertyAddress.trim()) results.push(makeResult('metadata.property_address', 'Property address is missing.', 'Add the inspected property address.'));
  if (!report.inspectionDate) results.push(makeResult('metadata.inspection_date', 'Inspection date is missing.', 'Record the inspection date.', {}, { waiverEligible: true }));
  if (!report.templateId || !report.templateVersion || !report.templateHash) {
    results.push(makeResult('template.assignment', 'A published template version is not assigned.', 'Assign and materialise an immutable published template.'));
  }
  if (report.inspectionType === 'exit' && !(report.baselineVersionIds?.length)) {
    results.push(makeResult('exit.baseline', 'Exit inspection has no immutable Entry baseline.', 'Select an approved Entry report version.'));
  }

  for (const area of aggregate.areas) {
    if (!area.components.length) {
      results.push(makeResult('area.coverage', `${area.name} has no assessment coverage.`, 'Assess the area or record why it is inaccessible.', { areaId: area.id }));
    }
    for (const component of area.components) {
      const location = { areaId: area.id, componentId: component.id };
      const rule = componentRule(context.template, area.id, component.id);
      if (rule?.required && component.conditionCategory === 'unable_to_confirm' && !component.commentary.trim()) {
        results.push(makeResult('component.required', `${component.component} has not been assessed.`, 'Complete the structured assessment or record a justified exception.', location));
      }
      if (['not_visible', 'not_applicable'].includes(component.visibility) && component.commentary.trim().length < 8) {
        results.push(makeResult('component.visibility_justification', `${component.component} needs a visibility justification.`, 'Explain why the component was not visible or is not applicable.', location, { waiverEligible: true }));
      }
      if (component.workingStatus === 'operation_confirmed' && (!component.testingMethod || component.testingMethod === 'not_tested' || component.testStatus !== 'tested_passed')) {
        results.push(makeResult('working_claim.test_method', `${component.component} is marked operational without a confirmed test method.`, 'Record the test method and passing result, or change the working status.', location));
      }
      if ((component.defects.length || component.maintenanceRequired || component.safetyConcern) && component.commentary.trim().length < 8) {
        results.push(makeResult('exception.commentary', `${component.component} has an exception without sufficient commentary.`, 'Describe the observed exception without unsupported causation or liability language.', location));
      }
      const requiresDefectEvidence = Boolean(rule?.minimumEvidence.some((requirement) => requirement.purpose === 'defect'));
      if ((component.defects.length || component.maintenanceRequired) && (requiresDefectEvidence || rule?.required) && !hasEvidence(context, area.id, component.id, ['defect', 'context'])) {
        results.push(makeResult('evidence.defect', `${component.component} is missing linked defect evidence.`, 'Link context and close-up evidence to this component.', location, { waiverEligible: true }));
      }
    }
  }

  for (const [evidenceId, status] of Object.entries(context.evidenceStatuses ?? {})) {
    if (status !== 'available') results.push(makeResult('evidence.availability', `Evidence ${evidenceId} is ${status}.`, 'Wait for validation or replace the failed evidence.', { evidenceId }));
  }
  if (context.stage === 'reviewer_approval') {
    if (context.analystId && context.reviewerId && context.analystId === context.reviewerId) {
      results.push(makeResult('approval.separation', 'Analyst and reviewer must be different users.', 'Assign an independent reviewer.'));
    }
    for (const comment of context.openReviewComments?.filter((item) => item.blocking && item.status === 'open') ?? []) {
      results.push(makeResult('review.blocking_comment', 'A blocking review comment is unresolved.', 'Resolve the review comment before approval.', {
        areaId: comment.areaId,
        componentId: comment.componentId,
        evidenceId: comment.evidenceId,
      }));
    }
  }
  if (context.stage === 'finalisation' && !report.pdfReference) results.push(makeResult('finalisation.pdf', 'The immutable PDF package is missing.', 'Generate and verify the final PDF package.'));
  if (context.stage === 'archive' && !report.archiveReference) results.push(makeResult('archive.manifest', 'The final archive is missing.', 'Generate and verify the archive manifest.'));

  const waivers = context.waivers ?? [];
  const active = results.filter((result) => !waivers.some((waiver) =>
    waiver.ruleId === result.ruleId && waiver.areaId === result.areaId && waiver.componentId === result.componentId && result.waiverEligible,
  ));
  const blocking = active.filter((result) => result.blocking);
  const penalty = active.reduce((total, result) => total + (result.severity === 'error' ? 12 : result.severity === 'warning' ? 5 : 1), 0);
  const identity = {
    reportId: report.id,
    workspaceRevision: report.workspaceRevision ?? 1,
    templateId: report.templateId,
    templateVersion: report.templateVersion,
    stage: context.stage,
    results,
    waivers,
  };
  return {
    id: `quality-${deterministicHash(identity).slice(8)}`,
    reportId: report.id,
    workspaceRevision: report.workspaceRevision ?? 1,
    ...(report.templateId ? { templateId: report.templateId } : {}),
    ...(report.templateVersion ? { templateVersion: report.templateVersion } : {}),
    ruleSetVersion: 'phase-1.0',
    stage: context.stage,
    status: blocking.length ? 'not_ready' : 'ready',
    score: Math.max(0, 100 - penalty),
    results,
    waivers,
    contentHash: deterministicHash(identity),
    createdAt: context.now ?? new Date().toISOString(),
  };
}

export function assertQualityRunCurrent(run: QualityRun, reportId: string, workspaceRevision: number): void {
  if (run.reportId !== reportId || run.workspaceRevision !== workspaceRevision) {
    throw Object.assign(new Error('Quality run is stale for the current report workspace.'), { code: 'QUALITY_RUN_STALE', status: 409 });
  }
  if (run.status !== 'ready') throw Object.assign(new Error('Quality gates are not complete.'), { code: 'QUALITY_GATE_NOT_MET', status: 409 });
}
