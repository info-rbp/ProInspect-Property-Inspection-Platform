import type {
  AuthenticatedPrincipal,
  AuthorisationTarget,
  ReportAggregate,
  ReportAreaRecord,
  ReportComponentRecord,
  ReportLifecycleStatus,
  SecurityCapability,
} from '@pcr/domain';
import type { SecurityDependencies } from '../security/types.js';
import type { QualityRun, QualityStage, QualityWaiver } from '@pcr/quality';

export interface StoredRecord {
  id: string;
  agencyId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface OperationalRepository {
  list(collection: string, agencyId: string, limit: number, cursor?: string): Promise<Page<StoredRecord>>;
  get(collection: string, agencyId: string, id: string): Promise<StoredRecord | undefined>;
  create(collection: string, agencyId: string, id: string, data: Record<string, unknown>, actorId: string): Promise<StoredRecord>;
  update(collection: string, agencyId: string, id: string, data: Record<string, unknown>, expectedVersion: number, actorId: string): Promise<StoredRecord>;
}

export interface ReportTransitionCommand {
  agencyId: string;
  reportId: string;
  status: ReportLifecycleStatus;
  expectedVersion: number;
  actorId: string;
  actorRole: string;
  correlationId: string;
  reason?: string;
  assignedUserId?: string;
}

export interface ReportAggregateStore {
  load(agencyId: string, reportId: string): Promise<ReportAggregate | undefined>;
  saveDraft(aggregate: ReportAggregate, expectedVersion: number | undefined, actorId: string): Promise<ReportAggregate>;
  updateMetadata(agencyId: string, reportId: string, patch: Record<string, unknown>, expectedVersion: number, actorId: string, correlationId: string): Promise<Record<string, unknown>>;
  createArea(agencyId: string, reportId: string, area: Record<string, unknown>, actorId: string, correlationId: string): Promise<ReportAreaRecord>;
  updateArea(agencyId: string, reportId: string, areaId: string, patch: Record<string, unknown>, expectedVersion: number, actorId: string, correlationId: string): Promise<ReportAreaRecord>;
  deleteArea(agencyId: string, reportId: string, areaId: string, expectedVersion: number, actorId: string, correlationId: string): Promise<void>;
  createComponent(agencyId: string, reportId: string, areaId: string, component: Record<string, unknown>, actorId: string, correlationId: string): Promise<ReportComponentRecord>;
  updateComponent(agencyId: string, reportId: string, areaId: string, componentId: string, patch: Record<string, unknown>, expectedVersion: number, actorId: string, correlationId: string): Promise<ReportComponentRecord>;
  reorderAreas(agencyId: string, reportId: string, orderedIds: string[], actorId: string, correlationId: string): Promise<Record<string, unknown>>;
  reorderComponents(agencyId: string, reportId: string, areaId: string, orderedIds: string[], actorId: string, correlationId: string): Promise<Record<string, unknown>>;
  runQuality(agencyId: string, reportId: string, stage: QualityStage, actorId: string, correlationId: string): Promise<QualityRun>;
  latestQuality(agencyId: string, reportId: string): Promise<QualityRun | undefined>;
  waiveQuality(agencyId: string, reportId: string, runId: string, waiver: Omit<QualityWaiver, 'waivedAt'>, correlationId: string): Promise<QualityRun>;
  transition(agencyId: string, command: ReportTransitionCommand): Promise<Record<string, unknown>>;
}

export interface IdempotencyResult {
  status: number;
  body: unknown;
}

export interface IdempotencyStore {
  execute(
    agencyId: string,
    operation: string,
    key: string,
    payloadHash: string,
    action: () => Promise<IdempotencyResult>,
  ): Promise<{ replayed: boolean; result: IdempotencyResult }>;
}

export interface TaskDispatcher {
  dispatch(kind: 'analysis' | 'pdf' | 'notification' | 'media' | 'import' | 'integration' | 'evidence_pack' | 'portfolio_audit', agencyId: string, taskId: string, payload: Record<string, unknown>): Promise<void>;
}

export interface UploadSessionIssuer {
  create(agencyId: string, uploadId: string, input: Record<string, unknown>, principal: AuthenticatedPrincipal): Promise<Record<string, unknown>>;
  complete(agencyId: string, uploadId: string, input: Record<string, unknown>, principal: AuthenticatedPrincipal): Promise<Record<string, unknown>>;
}

export interface ApiDependencies extends SecurityDependencies {
  repository: OperationalRepository;
  reports: ReportAggregateStore;
  idempotency: IdempotencyStore;
  tasks: TaskDispatcher;
  uploads: UploadSessionIssuer;
}

export interface RoutePolicy {
  collection: string;
  readCapability: SecurityCapability;
  writeCapability?: SecurityCapability;
  target(body: Record<string, unknown>, id?: string): AuthorisationTarget;
}
