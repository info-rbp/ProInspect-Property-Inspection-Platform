import type {
  AgencyEntitlementRecord,
  CommentaryPhrase,
  ComponentComparisonRecord,
  PortfolioAuditFinding,
} from './serviceRecords.js';

export class CommercialRuleError extends Error {
  readonly status = 409;
  constructor(readonly code: string, message: string) { super(message); }
}

function stableId(value: string): string {
  let first = 2166136261;
  let second = 2246822519;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function expandCommentaryPhrase(
  phrase: CommentaryPhrase,
  values: Record<string, string>,
): string {
  if (phrase.status !== 'active') throw new CommercialRuleError('PHRASE_NOT_ACTIVE', 'Only active commentary phrases can be inserted.');
  const missing = [...phrase.text.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/gu)]
    .map((match) => match[1] ?? '')
    .filter((key) => !values[key]?.trim());
  if (missing.length) throw new CommercialRuleError('PHRASE_VALUE_REQUIRED', `Missing phrase values: ${[...new Set(missing)].join(', ')}.`);
  return phrase.text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/gu, (_match, key: string) => values[key] ?? '').trim();
}

export function assertEntitled(
  entitlements: AgencyEntitlementRecord[],
  feature: string,
  at = new Date(),
  currentUsage = 0,
): AgencyEntitlementRecord {
  const time = at.getTime();
  const entitlement = entitlements.find((candidate) => candidate.feature === feature && candidate.enabled
    && Date.parse(candidate.effectiveFrom) <= time
    && (!candidate.effectiveTo || Date.parse(candidate.effectiveTo) > time));
  if (!entitlement) throw new CommercialRuleError('FEATURE_NOT_ENTITLED', `Feature ${feature} is not enabled for this agency.`);
  if (entitlement.limit !== undefined && currentUsage >= entitlement.limit) throw new CommercialRuleError('ENTITLEMENT_LIMIT_REACHED', `Feature ${feature} has reached its configured limit.`);
  return entitlement;
}

export interface ComparableComponent {
  id: string;
  templateComponentId?: string;
  name: string;
  condition?: string;
  cleanliness?: string;
  evidenceIds?: string[];
}

function normalise(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim(); }

export function compareComponents(source: ComparableComponent[], target: ComparableComponent[], runId: string): ComponentComparisonRecord[] {
  const claimed = new Set<string>();
  return target.map((current) => {
    const prior = source.find((candidate) => !claimed.has(candidate.id) && current.templateComponentId && candidate.templateComponentId === current.templateComponentId)
      ?? source.find((candidate) => !claimed.has(candidate.id) && normalise(candidate.name) === normalise(current.name));
    if (prior) claimed.add(prior.id);
    const classification: ComponentComparisonRecord['classification'] = !prior ? 'added'
      : !prior.condition || !current.condition ? 'insufficient_evidence'
      : prior.condition === current.condition && prior.cleanliness === current.cleanliness ? 'unchanged'
      : 'review_required';
    return {
      id: stableId(`${runId}|${prior?.id ?? 'none'}|${current.id}`),
      comparisonRunId: runId,
      ...(prior ? { sourceComponentId: prior.id } : {}), targetComponentId: current.id, classification,
      sourceEvidenceIds: prior?.evidenceIds ?? [], targetEvidenceIds: current.evidenceIds ?? [],
      confidence: classification === 'unchanged' ? 1 : prior ? 0.7 : 1,
      reviewStatus: classification === 'unchanged' || classification === 'added' ? 'accepted' : 'pending',
    };
  });
}

export interface PortfolioPropertyProjection {
  propertyId: string;
  hasEntryBaseline: boolean;
  nextInspectionAt?: string;
  unresolvedHighMaintenance: number;
  evidenceReadiness: number;
  accessFailureCount: number;
  hasFinalArchive: boolean;
  keyAccessComplete: boolean;
}

export function evaluatePortfolioProperty(record: PortfolioPropertyProjection, asAt: Date): PortfolioAuditFinding[] {
  const findings: PortfolioAuditFinding[] = [];
  const add = (category: PortfolioAuditFinding['category'], severity: PortfolioAuditFinding['severity'], title: string, action: string) => findings.push({
    id: stableId(`${record.propertyId}|${category}|${asAt.toISOString().slice(0, 10)}`),
    propertyId: record.propertyId, category, severity, title, detail: title, supportingReferences: [], recommendedAction: action,
  });
  if (!record.hasEntryBaseline) add('missing_entry', 'high', 'No final Entry baseline is available.', 'Arrange or import an Entry baseline.');
  if (record.nextInspectionAt && Date.parse(record.nextInspectionAt) < asAt.getTime()) add('overdue_inspection', 'high', 'Inspection is overdue.', 'Schedule an authorised inspection.');
  if (record.unresolvedHighMaintenance > 0) add('maintenance', 'critical', `${record.unresolvedHighMaintenance} high-priority maintenance item(s) remain unresolved.`, 'Review and authorise the maintenance workflow.');
  if (record.evidenceReadiness < 0.8) add('evidence_readiness', 'medium', 'Evidence readiness is below 80%.', 'Review missing evidence requirements.');
  if (record.accessFailureCount >= 2) add('access_failure', 'medium', 'Repeated access failures recorded.', 'Confirm access authority and instructions.');
  if (!record.hasFinalArchive) add('missing_archive', 'high', 'A final archive is missing.', 'Regenerate or verify the immutable archive.');
  if (!record.keyAccessComplete) add('key_access', 'medium', 'Key or access records are incomplete.', 'Reconcile key custody and access details.');
  return findings;
}
