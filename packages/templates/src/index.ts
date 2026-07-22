import type { InspectionType } from '@pcr/domain';

export type TemplateStatus = 'draft' | 'published' | 'retired';
export type VisibilityState = 'visible' | 'partially_visible' | 'not_visible' | 'not_applicable';
export type WorkingState = 'tested_working' | 'tested_not_working' | 'not_tested' | 'not_relevant';
export type ConditionState = 'clean_intact' | 'requires_cleaning' | 'minor_wear' | 'repair_required' | 'damaged';

export interface CommentaryEntry {
  id: string;
  area: string;
  component: string;
  inspectionTypes: InspectionType[];
  condition: ConditionState;
  text: string;
}

export interface TemplateComponent {
  id: string;
  name: string;
  required: boolean;
  photoRequired: boolean;
  rule?: TemplateComponentRule;
}

export interface EvidenceRequirement {
  purpose: 'overview' | 'context' | 'defect' | 'testing' | 'meter' | 'key' | 'comparison' | 'completion';
  minimum: number;
  waiverAllowed: boolean;
}

export interface TemplateComponentRule {
  componentId: string;
  required: boolean;
  conditionRequired: boolean;
  cleanlinessRequired: boolean;
  workingStatusRequired: boolean;
  testMethodRequiredWhenConfirmed: boolean;
  minimumEvidence: EvidenceRequirement[];
  maintenanceExtractionEnabled: boolean;
}

export interface TemplateCompletionRule {
  id: string;
  description: string;
  blocking: boolean;
  waiverAllowed: boolean;
}

export interface TemplateWorkflowProfile {
  analystApprovalRequired: boolean;
  reviewerApprovalRequired: boolean;
  reviewerIndependenceRequired: boolean;
  tenantReview: 'disabled' | 'optional' | 'required';
}

export interface TemplateArea {
  id: string;
  name: string;
  components: TemplateComponent[];
}

export interface InspectionTypeTemplate {
  id: string;
  version: number;
  inspectionType: InspectionType;
  propertyType: string;
  jurisdiction?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  furnishingProfile?: 'furnished' | 'unfurnished' | 'either';
  status: TemplateStatus;
  areas: TemplateArea[];
  commentaryBank: CommentaryEntry[];
  requiredMetadataFields?: string[];
  completionRules?: TemplateCompletionRule[];
  workflowProfile?: TemplateWorkflowProfile;
  permittedApprovalRoles?: string[];
  comparisonBaselineRequired?: boolean;
  outputLayoutVersion?: string;
  ownerSummaryLayoutVersion?: string;
  brandingCompatibilityVersion?: number;
  sourcePreset?: string;
  sourceTemplateId?: string;
  sourceTemplateVersion?: number;
  contentHash?: string;
  createdAt: string;
  publishedAt?: string;
  retiredAt?: string;
}

export interface StructuredInspectionFact {
  area: string;
  component: string;
  material?: string;
  colour?: string;
  type?: string;
  quantity?: number;
  visibility: VisibilityState;
  condition: ConditionState;
  cleanlinessIssue?: string;
  conditionIssue?: string;
  workingState: WorkingState;
  photoReferences: string[];
}

export interface GeneratedCommentary {
  area: string;
  component: string;
  commentary: string;
  photoReferences: string[];
  bankEntryId?: string;
}

export interface ImportRow {
  area: string;
  component: string;
  condition: string;
  inspectionTypes: string;
  text: string;
}

export interface ImportValidationIssue {
  row: number;
  code: 'DUPLICATE' | 'MISSING_VALUE' | 'INVALID_CONDITION' | 'INVALID_INSPECTION_TYPE';
  message: string;
}

export interface ImportValidationResult {
  entries: CommentaryEntry[];
  issues: ImportValidationIssue[];
}

const conditions = new Set<ConditionState>(['clean_intact', 'requires_cleaning', 'minor_wear', 'repair_required', 'damaged']);
const inspectionTypes = new Set<InspectionType>(['entry', 'routine', 'exit', 'comparison', 'maintenance']);
const prohibitedLiabilityLanguage = /\b(tenant caused|tenant damage|neglected|misuse|poorly maintained)\b/i;

export const templateKey = (template: Pick<InspectionTypeTemplate, 'id' | 'version'>): string => `${template.id}@${template.version}`;

export function publishTemplate(template: InspectionTypeTemplate, publishedAt = new Date().toISOString()): InspectionTypeTemplate {
  if (template.status !== 'draft') throw new Error('Only draft templates can be published.');
  validateTemplate(template);
  const identity = templateIdentity(template);
  return structuredClone({ ...template, status: 'published', publishedAt, contentHash: stableIdentityHash(identity) });
}

export function retireTemplate(template: InspectionTypeTemplate, retiredAt = new Date().toISOString()): InspectionTypeTemplate {
  if (template.status !== 'published') throw new Error('Only published templates can be retired.');
  return structuredClone({ ...template, status: 'retired', retiredAt });
}

export function assertTemplateEditable(template: InspectionTypeTemplate): void {
  if (template.status !== 'draft') throw new Error('Published and retired template versions are immutable.');
}

export function validateTemplate(template: InspectionTypeTemplate): void {
  if (!template.id.trim() || template.version < 1) throw new Error('Template identity and positive version are required.');
  if (!template.areas.length) throw new Error('Template must contain at least one area.');
  const areaIds = new Set<string>();
  for (const area of template.areas) {
    if (!area.id.trim() || !area.name.trim()) throw new Error('Area identity and name are required.');
    if (areaIds.has(area.id)) throw new Error(`Duplicate area id: ${area.id}`);
    areaIds.add(area.id);
    const componentIds = new Set<string>();
    for (const component of area.components) {
      if (!component.id.trim() || !component.name.trim()) throw new Error('Component identity and name are required.');
      if (componentIds.has(component.id)) throw new Error(`Duplicate component id in ${area.id}: ${component.id}`);
      componentIds.add(component.id);
      if (component.rule && component.rule.componentId !== component.id) throw new Error(`Component rule identity mismatch in ${area.id}: ${component.id}`);
      if (component.rule?.testMethodRequiredWhenConfirmed && !component.rule.workingStatusRequired) {
        throw new Error(`Testing-method rules require working status in ${area.id}: ${component.id}`);
      }
      for (const requirement of component.rule?.minimumEvidence ?? []) {
        if (!Number.isInteger(requirement.minimum) || requirement.minimum < 0) throw new Error(`Evidence minimum must be a non-negative integer in ${area.id}: ${component.id}`);
      }
    }
  }
  if (template.workflowProfile?.reviewerIndependenceRequired && !template.workflowProfile.reviewerApprovalRequired) {
    throw new Error('Reviewer independence requires reviewer approval.');
  }
}

export function templateIdentity(template: InspectionTypeTemplate): string {
  const copy = structuredClone(template) as InspectionTypeTemplate;
  delete copy.contentHash;
  delete copy.publishedAt;
  delete copy.retiredAt;
  return canonical(copy);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  return JSON.stringify(value);
}

function stableIdentityHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function importCommentaryBank(rows: ImportRow[]): ImportValidationResult {
  const issues: ImportValidationIssue[] = [];
  const entries: CommentaryEntry[] = [];
  const keys = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const area = normalizeName(row.area);
    const component = normalizeName(row.component);
    const text = row.text.trim();
    if (!area || !component || !text) {
      issues.push({ row: rowNumber, code: 'MISSING_VALUE', message: 'Area, component and commentary text are required.' });
      return;
    }
    if (!conditions.has(row.condition as ConditionState)) {
      issues.push({ row: rowNumber, code: 'INVALID_CONDITION', message: `Unsupported condition: ${row.condition}` });
      return;
    }
    const parsedTypes = row.inspectionTypes.split(',').map((value) => value.trim()).filter(Boolean);
    if (!parsedTypes.length || parsedTypes.some((value) => !inspectionTypes.has(value as InspectionType))) {
      issues.push({ row: rowNumber, code: 'INVALID_INSPECTION_TYPE', message: 'Inspection types must use supported canonical values.' });
      return;
    }
    const key = `${area}|${component}|${row.condition}|${parsedTypes.sort().join(',')}|${text.toLowerCase()}`;
    if (keys.has(key)) {
      issues.push({ row: rowNumber, code: 'DUPLICATE', message: 'Duplicate commentary-bank entry.' });
      return;
    }
    keys.add(key);
    entries.push({
      id: `commentary-${String(index + 1).padStart(4, '0')}`,
      area,
      component,
      condition: row.condition as ConditionState,
      inspectionTypes: parsedTypes as InspectionType[],
      text,
    });
  });
  return { entries, issues };
}

export function generateCommentary(template: InspectionTypeTemplate, fact: StructuredInspectionFact): GeneratedCommentary {
  const area = normalizeName(fact.area);
  const component = normalizeName(fact.component);
  if (fact.visibility === 'not_applicable') return result(fact, `${component} - Not applicable to this property.`);
  if (fact.visibility === 'not_visible') return result(fact, `${component} - Not visible in photos, condition unable to be confirmed.`);
  if (fact.visibility === 'partially_visible') return result(fact, `${component} - Partially visible in photos, appears intact where visible, full condition unable to be confirmed.`);
  const bank = template.commentaryBank.find((entry) => entry.area === area && entry.component === component && entry.condition === fact.condition && entry.inspectionTypes.includes(template.inspectionType));
  const description = [quantityText(fact.quantity), fact.material, fact.colour, fact.type].filter(Boolean).join(' ').trim();
  const observations = [fact.conditionIssue, fact.cleanlinessIssue].filter(Boolean).join(', ');
  const working = workingText(fact.workingState);
  const fallbackCondition = fact.condition === 'clean_intact' ? 'clean and intact' : humanize(fact.condition);
  const detail = [description || component, observations || fallbackCondition, working].filter(Boolean).join(', ');
  const commentary = `${component} - ${bank ? adaptBank(bank.text, detail) : detail}${shouldUseOtherwiseIntact(fact) ? ', otherwise intact' : ''}.`;
  validateGeneratedClaim(fact, commentary);
  return { ...result(fact, commentary), ...(bank ? { bankEntryId: bank.id } : {}) };
}

export function validateGeneratedClaim(fact: StructuredInspectionFact, commentary: string): void {
  if (prohibitedLiabilityLanguage.test(commentary)) throw new Error('Commentary contains unsupported liability or causation language.');
  if (/\b(operational|working condition|tested and working)\b/i.test(commentary) && fact.workingState !== 'tested_working') {
    throw new Error('Working-status claims require recorded operational testing.');
  }
  if (fact.visibility === 'visible' && !fact.photoReferences.length) throw new Error('Visible-condition claims require at least one photo reference.');
  if (/otherwise intact/i.test(commentary) && (fact.condition === 'damaged' || fact.condition === 'repair_required' || fact.workingState === 'tested_not_working')) {
    throw new Error('Otherwise intact cannot be used for broken, unsafe or non-working items.');
  }
}

function result(fact: StructuredInspectionFact, commentary: string): GeneratedCommentary {
  return { area: normalizeName(fact.area), component: normalizeName(fact.component), commentary, photoReferences: [...fact.photoReferences] };
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function quantityText(quantity?: number): string | undefined {
  return quantity === undefined ? undefined : `${quantity}x`;
}

function workingText(state: WorkingState): string | undefined {
  if (state === 'tested_working') return 'operation confirmed and in working condition and order';
  if (state === 'tested_not_working') return 'tested and not working';
  if (state === 'not_tested') return 'operation not confirmed from photos';
  return undefined;
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function shouldUseOtherwiseIntact(fact: StructuredInspectionFact): boolean {
  return Boolean((fact.conditionIssue || fact.cleanlinessIssue) && fact.condition !== 'damaged' && fact.condition !== 'repair_required' && fact.workingState !== 'tested_not_working');
}

function adaptBank(bankText: string, detail: string): string {
  return bankText.includes('{{details}}') ? bankText.replace('{{details}}', detail) : `${detail}, ${bankText.replace(/[.]+$/, '')}`;
}

export const PCR_STANDARD_AREAS = [
  'Exterior Front', 'Exterior Back', 'Garage / Carport', 'Entry', 'Lounge Room', 'Family Room', 'Dining Room',
  'Lounge / Dining Room', 'Kitchen', 'Passage / Hallway', 'Linen Press / Walk-in Linen Closet', 'Bedroom', 'Study',
  'Activity Room', 'Bathroom', 'Ensuite', 'Toilet / WC', 'Laundry', 'Security / Safety', 'General External Items',
  'Garden Shed / External Storage',
] as const;

export * from './materialise.js';
