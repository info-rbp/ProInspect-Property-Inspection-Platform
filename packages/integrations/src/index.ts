import type { ExternalReference, IntegrationConnectionRecord } from '@pcr/domain';

export type IntegrationEntity = 'property' | 'client' | 'tenancy' | 'inspection_job' | 'report' | 'owner_summary' | 'maintenance_item';
export type SourceOfTruth = 'provider' | 'proinspect' | 'manual_review';

export interface ProviderCapabilities {
  inbound: IntegrationEntity[];
  outbound: IntegrationEntity[];
  webhooks: boolean;
  polling: boolean;
}

export interface ProviderRecord { entity: IntegrationEntity; externalId: string; externalVersion?: string; fields: Record<string, unknown> }
export interface ReconciliationIssue { field: string; localValue: unknown; providerValue: unknown; policy: SourceOfTruth }
export interface ReconciliationResult { action: 'no_change' | 'update_local' | 'update_provider' | 'review'; patch: Record<string, unknown>; issues: ReconciliationIssue[] }

export interface ProviderAdapter {
  readonly provider: string;
  readonly capabilities: ProviderCapabilities;
  validateConnection(connection: IntegrationConnectionRecord): void;
  listChanges(cursor?: string): Promise<{ records: ProviderRecord[]; nextCursor?: string }>;
  push(record: ProviderRecord, idempotencyKey: string): Promise<{ externalId: string; externalVersion?: string }>;
  verifyWebhook(rawBody: Uint8Array, signature: string, secret: string): boolean;
}

export function validateConnectionMetadata(connection: IntegrationConnectionRecord & { credentialSecretRef?: string }): void {
  if (!connection.credentialSecretRef?.startsWith('projects/') || !connection.credentialSecretRef.includes('/secrets/')) {
    throw Object.assign(new Error('A Secret Manager resource reference is required; credentials must not be stored in the connection record.'), { code: 'SECRET_REFERENCE_REQUIRED' });
  }
  const forbidden = ['accessToken', 'refreshToken', 'clientSecret', 'password', 'apiKey'];
  if (forbidden.some((key) => key in connection)) throw Object.assign(new Error('Credential material is forbidden in integration records.'), { code: 'CREDENTIAL_MATERIAL_FORBIDDEN' });
}

export function reconcileFields(local: Record<string, unknown>, provider: Record<string, unknown>, policy: Record<string, SourceOfTruth>): ReconciliationResult {
  const patch: Record<string, unknown> = {};
  const issues: ReconciliationIssue[] = [];
  for (const field of new Set([...Object.keys(local), ...Object.keys(provider)])) {
    if (JSON.stringify(local[field]) === JSON.stringify(provider[field])) continue;
    const rule = policy[field] ?? 'manual_review';
    issues.push({ field, localValue: local[field], providerValue: provider[field], policy: rule });
    if (rule === 'provider') patch[field] = provider[field];
  }
  if (issues.some((issue) => issue.policy === 'manual_review')) return { action: 'review', patch, issues };
  if (issues.some((issue) => issue.policy === 'provider')) return { action: 'update_local', patch, issues };
  if (issues.length) return { action: 'update_provider', patch: {}, issues };
  return { action: 'no_change', patch: {}, issues: [] };
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value); if (row.some((cell) => cell.length)) rows.push(row); row = []; value = '';
    } else value += character;
  }
  row.push(value); if (row.some((cell) => cell.length)) rows.push(row);
  if (quoted) throw Object.assign(new Error('CSV contains an unclosed quoted value.'), { code: 'CSV_INVALID' });
  return rows;
}

export interface CsvImportResult { headers: string[]; records: Record<string, string>[]; warnings: string[] }
export function parseCanonicalCsv(input: string, requiredHeaders: string[]): CsvImportResult {
  const rows = parseCsvRows(input.replace(/^\uFEFF/u, ''));
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) throw Object.assign(new Error(`Missing required columns: ${missing.join(', ')}.`), { code: 'CSV_COLUMNS_MISSING' });
  const warnings: string[] = [];
  const records = rows.map((cells, rowIndex) => {
    if (cells.length !== headers.length) warnings.push(`Row ${rowIndex + 2} has ${cells.length} values for ${headers.length} columns.`);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? '']));
  });
  return { headers, records, warnings };
}

export function externalReferenceKey(reference: Pick<ExternalReference, 'provider' | 'entityType' | 'externalId'>): string {
  return `${reference.provider}:${reference.entityType}:${reference.externalId}`.toLowerCase();
}
