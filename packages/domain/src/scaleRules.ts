import type {
  AgencyEntitlementRecord,
  CapacitySlotRecord,
  ServiceAreaRecord,
  ServiceOrderRecord,
  SubscriptionUsageEventRecord,
} from './serviceRecords.js';

export class ScalePolicyError extends Error {
  readonly status = 409;
  constructor(readonly code: string, message: string, readonly details?: Record<string, unknown>) { super(message); }
}

export interface ServiceLevelPolicy {
  id: string;
  serviceType: ServiceOrderRecord['serviceType'];
  priorityHours: Partial<Record<ServiceOrderRecord['priority'], number>>;
  defaultHours: number;
  businessDaysOnly?: boolean;
}

function validDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ScalePolicyError('INVALID_DATE', `${field} must be a valid ISO date-time.`);
  return date;
}

export function resolveEntitlement(
  entitlements: AgencyEntitlementRecord[],
  feature: string,
  at = new Date(),
  usage = 0,
): AgencyEntitlementRecord {
  const active = entitlements.find((item) => item.feature === feature
    && item.enabled
    && validDate(item.effectiveFrom, 'effectiveFrom').getTime() <= at.getTime()
    && (!item.effectiveTo || validDate(item.effectiveTo, 'effectiveTo').getTime() > at.getTime()));
  if (!active) throw new ScalePolicyError('FEATURE_NOT_ENTITLED', `Feature ${feature} is not enabled for this agency.`);
  if (active.limit !== undefined && usage >= active.limit) {
    throw new ScalePolicyError('ENTITLEMENT_LIMIT_REACHED', `Feature ${feature} has reached its configured limit.`, { limit: active.limit, usage });
  }
  return active;
}

function addBusinessHours(start: Date, hours: number): Date {
  const result = new Date(start);
  let remaining = hours;
  while (remaining > 0) {
    result.setHours(result.getHours() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return result;
}

export function calculateServiceDueAt(
  requestedAt: string,
  serviceType: ServiceOrderRecord['serviceType'],
  priority: ServiceOrderRecord['priority'],
  policies: ServiceLevelPolicy[],
): string {
  const policy = policies.find((candidate) => candidate.serviceType === serviceType);
  if (!policy) throw new ScalePolicyError('SLA_POLICY_NOT_FOUND', `No service-level policy exists for ${serviceType}.`);
  const hours = policy.priorityHours[priority] ?? policy.defaultHours;
  if (!Number.isFinite(hours) || hours <= 0) throw new ScalePolicyError('SLA_POLICY_INVALID', 'Service-level hours must be greater than zero.');
  const start = validDate(requestedAt, 'requestedAt');
  return (policy.businessDaysOnly ? addBusinessHours(start, hours) : new Date(start.getTime() + hours * 3_600_000)).toISOString();
}

export function findServiceArea(areas: ServiceAreaRecord[], postcode: string, at = new Date()): ServiceAreaRecord {
  const normalised = postcode.trim();
  if (!/^\d{4}$/u.test(normalised)) throw new ScalePolicyError('POSTCODE_INVALID', 'Postcode must contain four digits.');
  const match = areas.find((area) => area.active && area.postcodes.includes(normalised));
  if (!match) throw new ScalePolicyError('SERVICE_AREA_UNAVAILABLE', `No active service area covers postcode ${normalised}.`);
  const day = at.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Perth' }).toLowerCase();
  if (!match.operatingHours[day]) throw new ScalePolicyError('SERVICE_AREA_CLOSED', `${match.name} does not operate on ${day}.`);
  return match;
}

export function reserveCapacity(
  slot: CapacitySlotRecord,
  requestedUnits: number,
  expectedReservedUnits: number,
): CapacitySlotRecord {
  if (!Number.isInteger(requestedUnits) || requestedUnits < 1) throw new ScalePolicyError('CAPACITY_UNITS_INVALID', 'requestedUnits must be a positive integer.');
  if (slot.reservedUnits !== expectedReservedUnits) {
    throw new ScalePolicyError('CAPACITY_VERSION_CONFLICT', 'Capacity changed before the reservation was applied.', {
      expectedReservedUnits,
      actualReservedUnits: slot.reservedUnits,
    });
  }
  if (slot.reservedUnits + requestedUnits > slot.capacityUnits) {
    throw new ScalePolicyError('CAPACITY_EXCEEDED', 'The capacity slot cannot accommodate this reservation.', {
      availableUnits: slot.capacityUnits - slot.reservedUnits,
      requestedUnits,
    });
  }
  return { ...slot, reservedUnits: slot.reservedUnits + requestedUnits };
}

export function assertNoCapacityOverlap(candidate: CapacitySlotRecord, existing: CapacitySlotRecord[]): void {
  const start = validDate(candidate.startAt, 'startAt').getTime();
  const end = validDate(candidate.endAt, 'endAt').getTime();
  if (end <= start) throw new ScalePolicyError('CAPACITY_WINDOW_INVALID', 'Capacity slot endAt must be after startAt.');
  const overlap = existing.find((slot) => slot.id !== candidate.id
    && slot.fieldUserId === candidate.fieldUserId
    && validDate(slot.startAt, 'startAt').getTime() < end
    && validDate(slot.endAt, 'endAt').getTime() > start);
  if (overlap) throw new ScalePolicyError('CAPACITY_SLOT_OVERLAP', 'The field user already has an overlapping capacity slot.', { conflictingSlotId: overlap.id });
}

export interface UsagePolicy {
  usageType: string;
  includedUnits: number;
  fairUseUnits: number;
}

export function classifyUsage(
  event: Omit<SubscriptionUsageEventRecord, 'classification'>,
  periodUsageBeforeEvent: number,
  policy: UsagePolicy,
): SubscriptionUsageEventRecord {
  if (event.usageType !== policy.usageType) throw new ScalePolicyError('USAGE_POLICY_MISMATCH', 'Usage event does not match the supplied policy.');
  if (!Number.isFinite(event.units) || event.units <= 0) throw new ScalePolicyError('USAGE_UNITS_INVALID', 'Usage units must be greater than zero.');
  if (policy.fairUseUnits < policy.includedUnits) throw new ScalePolicyError('USAGE_POLICY_INVALID', 'Fair-use units cannot be below included units.');
  const cumulative = periodUsageBeforeEvent + event.units;
  const classification: SubscriptionUsageEventRecord['classification'] = cumulative <= policy.includedUnits
    ? 'included'
    : cumulative <= policy.fairUseUnits ? 'fair_use_review' : 'additional_fee';
  return { ...event, classification };
}
