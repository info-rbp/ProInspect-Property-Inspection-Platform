import type { InspectionType } from './platform.js';

export const REPORT_ORIGINS = [
  'inspection_booking',
  'historical_import',
  'exceptional_manual',
  'comparison',
  'maintenance_follow_up',
] as const;

export type ReportOrigin = (typeof REPORT_ORIGINS)[number];

export const EXCEPTIONAL_REPORT_REASON_CODES = [
  'historical_manual',
  'comparison_only',
  'maintenance_follow_up',
  'administrative_correction',
] as const;

export type ExceptionalReportReasonCode = (typeof EXCEPTIONAL_REPORT_REASON_CODES)[number];

export interface ReportAuthorityMetadata {
  origin: ReportOrigin;
  propertyId: string;
  templateId: string;
  templateVersion: number;
  templateHash: string;
  createdBy: string;
  createdAt: string;
  bookingCommandId?: string;
  exceptionalReasonCode?: ExceptionalReportReasonCode;
  exceptionalReason?: string;
  sourceReportIds?: string[];
  sourceDocumentIds?: string[];
}

declare module './reportModel.js' {
  interface ReportMetadataRecord {
    origin?: ReportOrigin;
    createdBy?: string;
    bookingCommandId?: string;
    exceptionalReasonCode?: ExceptionalReportReasonCode;
    exceptionalReason?: string;
  }
}

export function isOrdinaryInspectionType(value: InspectionType | undefined): value is 'entry' | 'routine' | 'exit' {
  return value === 'entry' || value === 'routine' || value === 'exit';
}

export function assertReportAuthority(metadata: Record<string, unknown>): void {
  for (const field of ['origin', 'propertyId', 'templateId', 'templateHash', 'createdBy', 'createdAt']) {
    if (typeof metadata[field] !== 'string' || !String(metadata[field]).trim()) {
      throw new Error(`Canonical report metadata requires ${field}.`);
    }
  }
  if (!Number.isInteger(metadata.templateVersion) || Number(metadata.templateVersion) < 1) {
    throw new Error('Canonical report metadata requires a positive templateVersion.');
  }
  if (!REPORT_ORIGINS.includes(metadata.origin as ReportOrigin)) {
    throw new Error('Canonical report metadata contains an unsupported origin.');
  }
  if (metadata.origin === 'inspection_booking') {
    for (const field of ['inspectionJobId', 'bookingCommandId']) {
      if (typeof metadata[field] !== 'string' || !String(metadata[field]).trim()) {
        throw new Error(`Inspection-booking reports require ${field}.`);
      }
    }
  }
  if (metadata.origin === 'exceptional_manual') {
    if (!EXCEPTIONAL_REPORT_REASON_CODES.includes(metadata.exceptionalReasonCode as ExceptionalReportReasonCode)) {
      throw new Error('Exceptional reports require a supported reason code.');
    }
    if (typeof metadata.exceptionalReason !== 'string' || !metadata.exceptionalReason.trim()) {
      throw new Error('Exceptional reports require a reason.');
    }
  }
}
