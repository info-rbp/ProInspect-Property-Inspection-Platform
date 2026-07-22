import type {
  ComparisonRunRecord,
  DeliveryPackageRecord,
  EvidencePackRecord,
  FieldAttendanceRecord,
  ImportJobRecord,
  MaintenanceItemRecord,
  PortfolioAuditRunRecord,
  ServiceOrderRecord,
} from './serviceRecords.js';

export class ServiceWorkflowError extends Error {
  readonly status = 409;

  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function transition<T extends string>(current: T, next: T, graph: Readonly<Record<T, readonly T[]>>, entity: string): T {
  if (!graph[current]?.includes(next)) throw new ServiceWorkflowError('INVALID_SERVICE_TRANSITION', `${entity} cannot move from ${current} to ${next}.`);
  return next;
}

const maintenanceGraph: Readonly<Record<MaintenanceItemRecord['status'], readonly MaintenanceItemRecord['status'][]>> = {
  candidate: ['approved', 'cancelled'],
  approved: ['awaiting_owner', 'assigned', 'deferred', 'cancelled'],
  awaiting_owner: ['approved', 'assigned', 'deferred', 'cancelled'],
  assigned: ['in_progress', 'deferred', 'cancelled'],
  in_progress: ['completed', 'deferred', 'cancelled'],
  completed: ['verified', 'in_progress'],
  verified: ['closed', 'in_progress'],
  closed: [],
  deferred: ['approved', 'assigned', 'cancelled'],
  cancelled: [],
};

export function transitionMaintenance(item: MaintenanceItemRecord, next: MaintenanceItemRecord['status'], evidenceIds: string[] = []): MaintenanceItemRecord {
  if (['completed', 'verified', 'closed'].includes(next) && !evidenceIds.length) {
    throw new ServiceWorkflowError('COMPLETION_EVIDENCE_REQUIRED', 'Completion, verification and closure require evidence or an authorised verification exception.');
  }
  return { ...item, status: transition(item.status, next, maintenanceGraph, 'Maintenance item'), version: item.version + 1 };
}

const importGraph: Readonly<Record<ImportJobRecord['status'], readonly ImportJobRecord['status'][]>> = {
  queued: ['extracting', 'failed'],
  extracting: ['mapping', 'failed'],
  mapping: ['review_required', 'failed'],
  review_required: ['confirmed', 'failed'],
  confirmed: [],
  failed: ['queued'],
};

export function transitionImport(job: ImportJobRecord, next: ImportJobRecord['status'], acceptedCandidateCount = 0): ImportJobRecord {
  if (next === 'confirmed' && acceptedCandidateCount < 1) throw new ServiceWorkflowError('CONFIRMED_FACT_REQUIRED', 'An import requires at least one human-confirmed fact.');
  return { ...job, status: transition(job.status, next, importGraph, 'Import job'), ...(next === 'confirmed' ? { completedAt: new Date().toISOString() } : {}) };
}

const deliveryGraph: Readonly<Record<DeliveryPackageRecord['status'], readonly DeliveryPackageRecord['status'][]>> = {
  draft: ['queued', 'revoked'],
  queued: ['sent', 'failed', 'revoked'],
  sent: ['opened', 'failed', 'revoked', 'expired'],
  opened: ['downloaded', 'revoked', 'expired'],
  downloaded: ['revoked', 'expired'],
  revoked: [],
  expired: [],
  failed: ['queued', 'revoked'],
};

export function transitionDelivery(delivery: DeliveryPackageRecord, next: DeliveryPackageRecord['status'], at = new Date().toISOString()): DeliveryPackageRecord {
  const status = transition(delivery.status, next, deliveryGraph, 'Delivery');
  return {
    ...delivery,
    status,
    ...(next === 'sent' ? { sentAt: at } : {}),
    ...(next === 'opened' ? { openedAt: at } : {}),
    ...(next === 'downloaded' ? { downloadedAt: at } : {}),
  };
}

const comparisonGraph: Readonly<Record<ComparisonRunRecord['status'], readonly ComparisonRunRecord['status'][]>> = {
  queued: ['matching', 'failed'],
  matching: ['suggestions_ready', 'failed'],
  suggestions_ready: ['review_in_progress', 'failed'],
  review_in_progress: ['approved', 'suggestions_ready', 'failed'],
  approved: [],
  failed: ['queued'],
};

export function transitionComparison(run: ComparisonRunRecord, next: ComparisonRunRecord['status'], pendingReviewCount = 0): ComparisonRunRecord {
  if (next === 'approved' && (pendingReviewCount > 0 || run.unmatchedSourceIds.length > 0 || run.unmatchedTargetIds.length > 0)) {
    throw new ServiceWorkflowError('COMPARISON_REVIEW_INCOMPLETE', 'All comparison suggestions and unmatched records require a reviewer outcome.');
  }
  return { ...run, status: transition(run.status, next, comparisonGraph, 'Comparison run') };
}

const serviceOrderGraph: Readonly<Record<ServiceOrderRecord['status'], readonly ServiceOrderRecord['status'][]>> = {
  requested: ['triaged', 'cancelled'],
  triaged: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['quality_review', 'failed', 'cancelled'],
  quality_review: ['completed', 'in_progress', 'failed'],
  completed: [],
  cancelled: [],
  failed: ['assigned', 'in_progress', 'cancelled'],
};

export function transitionServiceOrder(order: ServiceOrderRecord, next: ServiceOrderRecord['status'], actorId: string, at = new Date().toISOString()): ServiceOrderRecord {
  if (!actorId.trim()) throw new ServiceWorkflowError('ACTOR_REQUIRED', 'A service-order transition requires an actor.');
  return { ...order, status: transition(order.status, next, serviceOrderGraph, 'Service order'), version: order.version + 1, updatedAt: at };
}

const attendanceGraph: Readonly<Record<FieldAttendanceRecord['status'], readonly FieldAttendanceRecord['status'][]>> = {
  scheduled: ['travelling', 'cancelled'], travelling: ['arrived', 'no_access', 'unsafe', 'cancelled'],
  arrived: ['completed', 'no_access', 'unsafe'], completed: [], no_access: [], unsafe: [], cancelled: [],
};

export function transitionFieldAttendance(record: FieldAttendanceRecord, next: FieldAttendanceRecord['status'], outcomeCode?: string, at = new Date().toISOString()): FieldAttendanceRecord {
  if (['completed', 'no_access', 'unsafe'].includes(next) && !outcomeCode?.trim()) {
    throw new ServiceWorkflowError('ATTENDANCE_OUTCOME_REQUIRED', 'A terminal attendance outcome requires an outcome code.');
  }
  return {
    ...record,
    status: transition(record.status, next, attendanceGraph, 'Field attendance'),
    version: record.version + 1,
    ...(next === 'arrived' ? { startedAt: at } : {}),
    ...(['completed', 'no_access', 'unsafe'].includes(next) ? { completedAt: at, outcomeCode } : {}),
  };
}

const evidencePackGraph: Readonly<Record<EvidencePackRecord['status'], readonly EvidencePackRecord['status'][]>> = {
  requested: ['approved', 'failed'], approved: ['assembling', 'revoked'], assembling: ['ready', 'failed', 'revoked'],
  ready: ['revoked', 'expired'], revoked: [], expired: [], failed: ['approved', 'revoked'],
};

export function transitionEvidencePack(record: EvidencePackRecord, next: EvidencePackRecord['status']): EvidencePackRecord {
  if (next === 'approved' && (!record.purpose?.trim() || !record.authorisedRequesterId?.trim() || !record.privacyReviewedBy?.trim())) {
    throw new ServiceWorkflowError('EVIDENCE_PACK_APPROVAL_INCOMPLETE', 'Purpose, authorised requester and privacy review are required before approval.');
  }
  return { ...record, status: transition(record.status, next, evidencePackGraph, 'Evidence pack') };
}

const portfolioAuditGraph: Readonly<Record<PortfolioAuditRunRecord['status'], readonly PortfolioAuditRunRecord['status'][]>> = {
  queued: ['processing', 'failed'], processing: ['review_required', 'failed'], review_required: ['approved', 'processing', 'failed'],
  approved: ['issued'], issued: [], failed: ['queued'],
};

export function transitionPortfolioAudit(record: PortfolioAuditRunRecord, next: PortfolioAuditRunRecord['status'], actorId?: string): PortfolioAuditRunRecord {
  if (next === 'approved' && !actorId?.trim()) throw new ServiceWorkflowError('APPROVER_REQUIRED', 'Portfolio audit approval requires an identified approver.');
  return { ...record, status: transition(record.status, next, portfolioAuditGraph, 'Portfolio audit'), version: record.version + 1, ...(next === 'approved' ? { approvedBy: actorId } : {}) };
}
