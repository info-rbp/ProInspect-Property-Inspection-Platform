import { createHash } from 'node:crypto';
import type { AgencyBrandingVersion } from './serviceRecords.js';

export class BrandingLifecycleError extends Error {
  readonly status = 409;
  constructor(readonly code: string, message: string) { super(message); }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validColour(value: string): boolean { return /^#[0-9a-f]{6}$/iu.test(value); }

export function validateBrandingDraft(record: AgencyBrandingVersion): void {
  if (!record.id.trim() || !record.agencyId.trim()) throw new BrandingLifecycleError('BRANDING_ID_REQUIRED', 'Branding id and agency id are required.');
  if (!Number.isInteger(record.version) || record.version < 1) throw new BrandingLifecycleError('BRANDING_VERSION_INVALID', 'Branding version must be a positive integer.');
  if (!validColour(record.primaryColour) || !validColour(record.secondaryColour)) throw new BrandingLifecycleError('BRANDING_COLOUR_INVALID', 'Branding colours must be six-digit hexadecimal values.');
  if (Object.keys(record.contactDetails).length === 0) throw new BrandingLifecycleError('BRANDING_CONTACT_REQUIRED', 'At least one contact detail is required.');
  if (Object.entries(record.contactDetails).some(([key, value]) => !key.trim() || !value.trim())) throw new BrandingLifecycleError('BRANDING_CONTACT_INVALID', 'Branding contact details cannot contain blank keys or values.');
  if (record.emailSenderName !== undefined && !record.emailSenderName.trim()) throw new BrandingLifecycleError('BRANDING_SENDER_INVALID', 'Email sender name cannot be blank.');
}

export function brandingContentHash(record: AgencyBrandingVersion): string {
  const content = {
    agencyId: record.agencyId,
    version: record.version,
    logoEvidenceId: record.logoEvidenceId,
    primaryColour: record.primaryColour.toLowerCase(),
    secondaryColour: record.secondaryColour.toLowerCase(),
    contactDetails: record.contactDetails,
    reportFooterText: record.reportFooterText,
    disclaimerTemplateId: record.disclaimerTemplateId,
    emailSenderName: record.emailSenderName,
  };
  return createHash('sha256').update(canonical(content)).digest('hex');
}

export function publishBranding(record: AgencyBrandingVersion): AgencyBrandingVersion {
  if (record.status !== 'draft') throw new BrandingLifecycleError('BRANDING_DRAFT_REQUIRED', 'Only draft branding versions can be published.');
  validateBrandingDraft(record);
  return { ...record, status: 'published', contentHash: brandingContentHash(record) };
}

export function retireBranding(record: AgencyBrandingVersion): AgencyBrandingVersion {
  if (record.status !== 'published') throw new BrandingLifecycleError('BRANDING_PUBLISHED_REQUIRED', 'Only published branding versions can be retired.');
  return { ...record, status: 'retired' };
}

export function cloneBranding(record: AgencyBrandingVersion, nextVersion: number): AgencyBrandingVersion {
  if (!Number.isInteger(nextVersion) || nextVersion <= record.version) throw new BrandingLifecycleError('BRANDING_VERSION_ORDER_INVALID', 'The cloned version must be greater than the source version.');
  return { ...record, version: nextVersion, status: 'draft', contentHash: '' };
}

export function assertPublishedBrandingImmutable(current: AgencyBrandingVersion, proposed: AgencyBrandingVersion): void {
  if (current.status !== 'published') return;
  if (brandingContentHash(current) !== brandingContentHash(proposed)) throw new BrandingLifecycleError('PUBLISHED_BRANDING_IMMUTABLE', 'Published branding content cannot be changed. Clone it into a new draft version instead.');
}
