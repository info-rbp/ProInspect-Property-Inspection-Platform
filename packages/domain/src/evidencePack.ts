import { createHash } from 'node:crypto';
import type { EvidenceIndexRecord, EvidencePackRecord } from './serviceRecords.js';

export class EvidencePackError extends Error {
  readonly status = 409;
  constructor(readonly code: string, message: string, readonly details?: Record<string, unknown>) { super(message); }
}

export interface EvidencePackManifestItem {
  evidenceId: string;
  evidenceType: EvidenceIndexRecord['evidenceType'];
  reportId?: string;
  reportVersionId?: string;
  areaId?: string;
  componentIds: string[];
  purposeTags: string[];
  privacyClassification: EvidenceIndexRecord['privacyClassification'];
  retentionClass: string;
}

export interface EvidencePackManifest {
  schemaVersion: 1;
  evidencePackId: string;
  agencyId: string;
  propertyId: string;
  purpose: string;
  authorisedRequesterId: string;
  privacyReviewedBy: string;
  generatedAt: string;
  expiresAt?: string;
  itemCount: number;
  items: EvidencePackManifestItem[];
  contentHash: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildEvidencePackManifest(
  pack: EvidencePackRecord,
  evidence: EvidenceIndexRecord[],
  generatedAt = new Date().toISOString(),
): EvidencePackManifest {
  if (pack.status !== 'approved' && pack.status !== 'assembling') throw new EvidencePackError('EVIDENCE_PACK_NOT_APPROVED', 'Only approved evidence packs can be assembled.');
  if (!pack.purpose?.trim()) throw new EvidencePackError('EVIDENCE_PACK_PURPOSE_REQUIRED', 'A documented purpose is required.');
  if (!pack.authorisedRequesterId?.trim()) throw new EvidencePackError('EVIDENCE_PACK_REQUESTER_REQUIRED', 'An authorised requester is required.');
  if (!pack.privacyReviewedBy?.trim()) throw new EvidencePackError('EVIDENCE_PACK_PRIVACY_REVIEW_REQUIRED', 'A privacy review is required.');
  if (!pack.evidenceIds.length) throw new EvidencePackError('EVIDENCE_PACK_EMPTY', 'At least one evidence item is required.');
  if (pack.expiresAt && Date.parse(pack.expiresAt) <= Date.parse(generatedAt)) throw new EvidencePackError('EVIDENCE_PACK_EXPIRED', 'The evidence pack expiry must be after generation.');

  const byId = new Map(evidence.map((record) => [record.id, record]));
  const missing = pack.evidenceIds.filter((id) => !byId.has(id));
  if (missing.length) throw new EvidencePackError('EVIDENCE_NOT_FOUND', 'One or more evidence records were not found.', { evidenceIds: missing });

  const selected = pack.evidenceIds.map((id) => byId.get(id)!);
  const invalid = selected.filter((record) => record.agencyId !== pack.agencyId || record.propertyId !== pack.propertyId);
  if (invalid.length) throw new EvidencePackError('EVIDENCE_SCOPE_MISMATCH', 'Evidence must belong to the same agency and property as the pack.', { evidenceIds: invalid.map((item) => item.id) });
  const unavailable = selected.filter((record) => !['available', 'held'].includes(record.status));
  if (unavailable.length) throw new EvidencePackError('EVIDENCE_UNAVAILABLE', 'Deleted, restricted or pending-deletion evidence cannot be exported.', { evidenceIds: unavailable.map((item) => item.id) });
  const sensitive = selected.filter((record) => ['sensitive', 'redacted'].includes(record.privacyClassification));
  if (sensitive.length && !pack.privacyReviewedBy) throw new EvidencePackError('SENSITIVE_EVIDENCE_REVIEW_REQUIRED', 'Sensitive evidence requires named privacy review.');

  const items: EvidencePackManifestItem[] = selected
    .map((record) => ({
      evidenceId: record.id,
      evidenceType: record.evidenceType,
      ...(record.reportId ? { reportId: record.reportId } : {}),
      ...(record.reportVersionId ? { reportVersionId: record.reportVersionId } : {}),
      ...(record.areaId ? { areaId: record.areaId } : {}),
      componentIds: [...record.componentIds].sort(),
      purposeTags: [...record.purposeTags].sort(),
      privacyClassification: record.privacyClassification,
      retentionClass: record.retentionClass,
    }))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));

  const unsigned = {
    schemaVersion: 1 as const,
    evidencePackId: pack.id,
    agencyId: pack.agencyId,
    propertyId: pack.propertyId,
    purpose: pack.purpose.trim(),
    authorisedRequesterId: pack.authorisedRequesterId,
    privacyReviewedBy: pack.privacyReviewedBy,
    generatedAt,
    ...(pack.expiresAt ? { expiresAt: pack.expiresAt } : {}),
    itemCount: items.length,
    items,
  };
  return { ...unsigned, contentHash: createHash('sha256').update(canonical(unsigned)).digest('hex') };
}
