import type { PortfolioAuditFinding, PortfolioAuditRunRecord } from './serviceRecords.js';
import { stableHash } from './stableHash.js';

export interface PortfolioAuditProjection {
  propertyId: string;
  hasEntryBaseline: boolean;
  nextInspectionAt?: string;
  unresolvedHighMaintenance: number;
  evidenceReadiness: number;
  accessFailureCount: number;
  hasFinalArchive: boolean;
  keyAccessComplete: boolean;
  retentionExceptionCount?: number;
  turnaroundHours?: number;
  turnaroundTargetHours?: number;
}

export class PortfolioAuditError extends Error {
  readonly status = 409;
  constructor(readonly code: string, message: string) { super(message); }
}

function id(propertyId: string, category: PortfolioAuditFinding['category'], date: string): string {
  return stableHash({ propertyId, category, date }).slice(0, 32);
}

export function evaluatePortfolioProjection(record: PortfolioAuditProjection, asAt: Date): PortfolioAuditFinding[] {
  if (!record.propertyId.trim()) throw new PortfolioAuditError('PROPERTY_ID_REQUIRED', 'propertyId is required.');
  if (record.evidenceReadiness < 0 || record.evidenceReadiness > 1) throw new PortfolioAuditError('EVIDENCE_READINESS_INVALID', 'evidenceReadiness must be between zero and one.');
  const date = asAt.toISOString().slice(0, 10);
  const findings: PortfolioAuditFinding[] = [];
  const add = (category: PortfolioAuditFinding['category'], severity: PortfolioAuditFinding['severity'], title: string, detail: string, action: string, references: string[] = []) => findings.push({
    id: id(record.propertyId, category, date), propertyId: record.propertyId, category, severity, title, detail, supportingReferences: references, recommendedAction: action,
  });

  if (!record.hasEntryBaseline) add('missing_entry', 'high', 'Entry baseline missing', 'No final Entry report is available for future comparison.', 'Import or complete an Entry baseline.');
  if (record.nextInspectionAt && Date.parse(record.nextInspectionAt) < asAt.getTime()) add('overdue_inspection', 'high', 'Inspection overdue', `The next inspection date was ${record.nextInspectionAt}.`, 'Schedule an authorised inspection.');
  if (record.unresolvedHighMaintenance > 0) add('maintenance', 'critical', 'High-priority maintenance unresolved', `${record.unresolvedHighMaintenance} high-priority item(s) remain unresolved.`, 'Review and authorise the maintenance workflow.');
  if (record.evidenceReadiness < 0.8) add('evidence_readiness', 'medium', 'Evidence readiness below target', `Evidence readiness is ${Math.round(record.evidenceReadiness * 100)}%.`, 'Review missing or unusable evidence.');
  if (record.accessFailureCount >= 2) add('access_failure', 'medium', 'Repeated access failures', `${record.accessFailureCount} access failures are recorded.`, 'Reconfirm access authority, keys and attendance instructions.');
  if (!record.hasFinalArchive) add('missing_archive', 'high', 'Final archive missing', 'The property does not have a verified immutable final archive.', 'Regenerate or verify the archive.');
  if (!record.keyAccessComplete) add('key_access', 'medium', 'Key or access records incomplete', 'Key custody or property access information is incomplete.', 'Reconcile key custody and access details.');
  if ((record.retentionExceptionCount ?? 0) > 0) add('retention', 'high', 'Retention exceptions detected', `${record.retentionExceptionCount} evidence or document record(s) have retention exceptions.`, 'Review retention holds and pending deletion records.');
  if (record.turnaroundHours !== undefined && record.turnaroundTargetHours !== undefined && record.turnaroundHours > record.turnaroundTargetHours) {
    add('turnaround', 'medium', 'Turnaround target exceeded', `Turnaround was ${record.turnaroundHours} hours against a ${record.turnaroundTargetHours}-hour target.`, 'Review queue ownership, blockers and service capacity.');
  }
  return findings;
}

export function buildPortfolioAuditRun(
  idValue: string,
  agencyId: string,
  propertyIds: string[],
  projections: PortfolioAuditProjection[],
  createdBy: string,
  asAt = new Date(),
): PortfolioAuditRunRecord {
  if (!idValue.trim() || !agencyId.trim() || !createdBy.trim()) throw new PortfolioAuditError('AUDIT_IDENTITY_REQUIRED', 'Audit id, agency id and creator are required.');
  const uniquePropertyIds = [...new Set(propertyIds)];
  const missing = uniquePropertyIds.filter((propertyId) => !projections.some((projection) => projection.propertyId === propertyId));
  if (missing.length) throw new PortfolioAuditError('AUDIT_PROJECTION_MISSING', `Missing portfolio projections for: ${missing.join(', ')}.`);
  return {
    id: idValue,
    agencyId,
    scope: { propertyIds: uniquePropertyIds, asAtDate: asAt.toISOString() },
    ruleVersion: 'portfolio-audit-v1',
    status: 'review_required',
    findings: uniquePropertyIds.flatMap((propertyId) => evaluatePortfolioProjection(projections.find((projection) => projection.propertyId === propertyId)!, asAt)),
    createdBy,
    version: 1,
  };
}

export function approvePortfolioAudit(run: PortfolioAuditRunRecord, actorId: string): PortfolioAuditRunRecord {
  if (run.status !== 'review_required') throw new PortfolioAuditError('AUDIT_REVIEW_REQUIRED', 'Only audits awaiting review can be approved.');
  if (!actorId.trim()) throw new PortfolioAuditError('AUDIT_APPROVER_REQUIRED', 'An identified approver is required.');
  return { ...run, status: 'approved', approvedBy: actorId, version: run.version + 1 };
}
