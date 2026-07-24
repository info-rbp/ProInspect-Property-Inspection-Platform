import {
  COMPONENT_CLEANLINESS_CATEGORIES,
  COMPONENT_COMPARISON_STATUSES,
  COMPONENT_CONDITION_CATEGORIES,
  COMPONENT_REVIEW_STATUSES,
  COMPONENT_TEST_STATUSES,
  COMPONENT_TESTING_METHODS,
  COMPONENT_VISIBILITY_STATES,
  COMPONENT_WORKING_STATUSES,
  EXCEPTIONAL_REPORT_REASON_CODES,
  REPORT_EVIDENCE_PURPOSES,
  REPORT_ORIGINS,
  type ReportAggregate,
} from '@pcr/domain';
import type { ValidationResult, ValidationSchema } from './index.js';

const conditions = new Set<string>(COMPONENT_CONDITION_CATEGORIES);
const cleanliness = new Set<string>(COMPONENT_CLEANLINESS_CATEGORIES);
const working = new Set<string>(COMPONENT_WORKING_STATUSES);
const testing = new Set<string>(COMPONENT_TEST_STATUSES);
const visibility = new Set<string>(COMPONENT_VISIBILITY_STATES);
const testingMethods = new Set<string>(COMPONENT_TESTING_METHODS);
const reviews = new Set<string>(COMPONENT_REVIEW_STATUSES);
const comparisons = new Set<string>(COMPONENT_COMPARISON_STATUSES);
const evidencePurposes = new Set<string>(REPORT_EVIDENCE_PURPOSES);
const reportOrigins = new Set<string>(REPORT_ORIGINS);
const exceptionalReasons = new Set<string>(EXCEPTIONAL_REPORT_REASON_CODES);

function failure(message: string, field: string): ValidationResult<never> {
  return { ok: false, error: { code: 'VALIDATION_ERROR', message, status: 400, details: { field } } };
}

function object(value: unknown, field: string): ValidationResult<Record<string, unknown>> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ok: true, value: value as Record<string, unknown> };
  return failure(`${field} must be an object.`, field);
}

function string(value: unknown, field: string): ValidationResult<string> {
  if (typeof value === 'string' && value.trim()) return { ok: true, value: value.trim() };
  return failure(`${field} is required.`, field);
}

function positiveInteger(value: unknown, field: string): ValidationResult<number> {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return { ok: true, value };
  return failure(`${field} must be a positive integer.`, field);
}

function enumValue(value: unknown, values: Set<string>, field: string): ValidationResult<string> {
  if (typeof value === 'string' && values.has(value)) return { ok: true, value };
  return failure(`${field} is not supported.`, field);
}

function assertNoBinary(value: unknown, path = 'aggregate'): ValidationResult<true> {
  if (typeof value === 'string' && (value.startsWith('data:') || value.length > 200_000)) {
    return failure('Binary or oversized inline content is not permitted in Firestore report data.', path);
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = assertNoBinary(value[index], `${path}[${index}]`);
      if (!result.ok) return result;
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (['file', 'blob', 'bytes', 'base64', 'previewUrl'].includes(key)) return failure('Binary fields are not permitted in Firestore report data.', `${path}.${key}`);
      const result = assertNoBinary(child, `${path}.${key}`);
      if (!result.ok) return result;
    }
  }
  return { ok: true, value: true };
}

function validateReportAuthority(report: Record<string, unknown>): ValidationResult<true> {
  for (const field of ['id', 'agencyId', 'origin', 'propertyId', 'reportType', 'propertyAddress', 'lifecycleStatus', 'templateId', 'templateHash', 'createdBy', 'createdAt']) {
    const result = string(report[field], `report.${field}`);
    if (!result.ok) return result;
  }
  const origin = enumValue(report.origin, reportOrigins, 'report.origin');
  if (!origin.ok) return origin;
  const templateVersion = positiveInteger(report.templateVersion, 'report.templateVersion');
  if (!templateVersion.ok) return templateVersion;
  const assignment = object(report.templateAssignment, 'report.templateAssignment');
  if (!assignment.ok) return assignment;
  for (const field of ['templateId', 'templateHash', 'assignedAt', 'assignedBy']) {
    const result = string(assignment.value[field], `report.templateAssignment.${field}`);
    if (!result.ok) return result;
  }
  const assignmentVersion = positiveInteger(assignment.value.templateVersion, 'report.templateAssignment.templateVersion');
  if (!assignmentVersion.ok) return assignmentVersion;
  if (assignment.value.immutable !== true) return failure('templateAssignment must be immutable.', 'report.templateAssignment.immutable');
  if (assignment.value.templateId !== report.templateId || assignment.value.templateVersion !== report.templateVersion || assignment.value.templateHash !== report.templateHash) {
    return failure('Template assignment must match canonical report template metadata.', 'report.templateAssignment');
  }
  if (origin.value === 'inspection_booking') {
    for (const field of ['inspectionJobId', 'bookingCommandId']) {
      const result = string(report[field], `report.${field}`);
      if (!result.ok) return result;
    }
    if (!['entry', 'routine', 'exit'].includes(String(report.inspectionType))) {
      return failure('Inspection-booking reports require entry, routine or exit inspectionType.', 'report.inspectionType');
    }
  }
  if (origin.value === 'exceptional_manual') {
    const reasonCode = enumValue(report.exceptionalReasonCode, exceptionalReasons, 'report.exceptionalReasonCode');
    if (!reasonCode.ok) return reasonCode;
    const reason = string(report.exceptionalReason, 'report.exceptionalReason');
    if (!reason.ok) return reason;
    if (report.inspectionJobId !== undefined) return failure('Exceptional reports cannot be linked to an inspection job.', 'report.inspectionJobId');
  }
  return { ok: true, value: true };
}

export const reportAggregateSchema: ValidationSchema<ReportAggregate> = {
  parse(value) {
    const aggregate = object(value, 'aggregate');
    if (!aggregate.ok) return aggregate;
    const binaryCheck = assertNoBinary(aggregate.value);
    if (!binaryCheck.ok) return binaryCheck;

    const report = object(aggregate.value.report, 'report');
    if (!report.ok) return report;
    const authority = validateReportAuthority(report.value);
    if (!authority.ok) return authority;
    if (!Array.isArray(aggregate.value.areas)) return failure('areas must be an array.', 'areas');

    const sequences = new Set<number>();
    for (let areaIndex = 0; areaIndex < aggregate.value.areas.length; areaIndex += 1) {
      const area = object(aggregate.value.areas[areaIndex], `areas[${areaIndex}]`);
      if (!area.ok) return area;
      for (const field of ['id', 'name']) {
        const result = string(area.value[field], `areas[${areaIndex}].${field}`);
        if (!result.ok) return result;
      }
      const sequence = positiveInteger(area.value.sequence, `areas[${areaIndex}].sequence`);
      if (!sequence.ok) return sequence;
      if (sequences.has(sequence.value)) return failure('Area sequence values must be unique.', `areas[${areaIndex}].sequence`);
      sequences.add(sequence.value);
      if (!Array.isArray(area.value.components)) return failure('components must be an array.', `areas[${areaIndex}].components`);
      for (let componentIndex = 0; componentIndex < area.value.components.length; componentIndex += 1) {
        const prefix = `areas[${areaIndex}].components[${componentIndex}]`;
        const component = object(area.value.components[componentIndex], prefix);
        if (!component.ok) return component;
        for (const field of ['id', 'component', 'commentary']) {
          const result = string(component.value[field], `${prefix}.${field}`);
          if (!result.ok) return result;
        }
        const categoryChecks = [
          enumValue(component.value.visibility, visibility, `${prefix}.visibility`),
          enumValue(component.value.conditionCategory, conditions, `${prefix}.conditionCategory`),
          enumValue(component.value.cleanlinessCategory, cleanliness, `${prefix}.cleanlinessCategory`),
          enumValue(component.value.workingStatus, working, `${prefix}.workingStatus`),
          enumValue(component.value.testStatus, testing, `${prefix}.testStatus`),
          enumValue(component.value.reviewStatus, reviews, `${prefix}.reviewStatus`),
          enumValue(component.value.comparisonStatus, comparisons, `${prefix}.comparisonStatus`),
        ];
        const invalid = categoryChecks.find((result) => !result.ok);
        if (invalid && !invalid.ok) return invalid;
        if (component.value.testingMethod !== undefined) {
          const method = enumValue(component.value.testingMethod, testingMethods, `${prefix}.testingMethod`);
          if (!method.ok) return method;
        }
        if (component.value.workingStatus === 'operation_confirmed' && (!component.value.testingMethod || component.value.testingMethod === 'not_tested')) {
          return failure('operation_confirmed requires an explicit testingMethod.', `${prefix}.testingMethod`);
        }
        if (typeof component.value.maintenanceRequired !== 'boolean') return failure('maintenanceRequired must be a boolean.', `${prefix}.maintenanceRequired`);
        if (!Array.isArray(component.value.defects) || component.value.defects.some((defect) => typeof defect !== 'string')) {
          return failure('defects must be an array of strings.', `${prefix}.defects`);
        }
        if (!Array.isArray(component.value.photoReferences)) return failure('photoReferences must be an array.', `${prefix}.photoReferences`);
        const photoSequences = new Set<number>();
        for (const [photoIndex, reference] of component.value.photoReferences.entries()) {
          const photoPrefix = `${prefix}.photoReferences[${photoIndex}]`;
          const photo = object(reference, photoPrefix);
          if (!photo.ok) return photo;
          for (const field of ['photoId', 'objectPath']) {
            const result = string(photo.value[field], `${photoPrefix}.${field}`);
            if (!result.ok) return result;
          }
          if (photo.value.purpose !== undefined) {
            const purpose = enumValue(photo.value.purpose, evidencePurposes, `${photoPrefix}.purpose`);
            if (!purpose.ok) return purpose;
          }
          if (photo.value.sequence !== undefined) {
            const photoSequence = positiveInteger(photo.value.sequence, `${photoPrefix}.sequence`);
            if (!photoSequence.ok) return photoSequence;
            if (photoSequences.has(photoSequence.value)) return failure('Evidence sequence values must be unique within a component.', `${photoPrefix}.sequence`);
            photoSequences.add(photoSequence.value);
          }
          if (photo.value.contentType !== undefined && (typeof photo.value.contentType !== 'string' || !photo.value.contentType.trim())) {
            return failure('contentType must be a non-empty string.', `${photoPrefix}.contentType`);
          }
        }
        if (component.value.quantity !== undefined && (typeof component.value.quantity !== 'number' || component.value.quantity < 0)) {
          return failure('quantity must be a non-negative number.', `${prefix}.quantity`);
        }
        if (component.value.aiConfidence !== undefined && (typeof component.value.aiConfidence !== 'number' || component.value.aiConfidence < 0 || component.value.aiConfidence > 1)) {
          return failure('aiConfidence must be between 0 and 1.', `${prefix}.aiConfidence`);
        }
      }
    }
    return { ok: true, value: value as ReportAggregate };
  },
};
