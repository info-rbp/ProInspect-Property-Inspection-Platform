import { getFirestore } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref as storageRef } from 'firebase/storage';
import { openDB } from 'idb';
import type { Photo, ReportData, Room } from '../types';
import { apiRequest } from './apiClient';
import { runShellOperation } from './runShellOperation';
import { auth, firebaseApp, isFirebaseConfigured } from './firebaseClient';

export let db: ReturnType<typeof getFirestore> | undefined;
export let storage: ReturnType<typeof getStorage> | undefined;

try {
  if (firebaseApp) {
    db = getFirestore(firebaseApp);
    storage = getStorage(firebaseApp);
  }
} catch (error) {
  console.error('Firebase initialization failed', error);
}

export const getFirestoreDb = () => db;
export const getFirebaseAuth = () => auth;
export { auth, isFirebaseConfigured };

const LOCAL_DB_NAME = 'rbp-reports-db';
const LOCAL_STORE_NAME = 'reports';
const resolvedPhotoUrls = new Map<string, Promise<string>>();

interface AggregateComponent {
  id: string;
  component: string;
  visibility: string;
  testingMethod?: string;
  conditionCategory: string;
  cleanlinessCategory: string;
  workingStatus: string;
  testStatus: string;
  defects: string[];
  maintenanceRequired: boolean;
  commentary: string;
  photoReferences: Array<{ photoId: string; objectPath: string; thumbnailObjectPath?: string }>;
  reviewStatus: string;
  comparisonStatus: string;
}

interface AggregateArea {
  id: string;
  name: string;
  sequence: number;
  overallCommentary?: string;
  components: AggregateComponent[];
}

interface ReportAggregatePayload {
  report: Record<string, unknown> & { id: string; agencyId: string; lifecycleStatus: string; version?: number; createdAt?: string; updatedAt?: string };
  areas: AggregateArea[];
  expectedVersion?: number;
}

export const initLocalDB = async () => openDB(LOCAL_DB_NAME, 2, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(LOCAL_STORE_NAME)) database.createObjectStore(LOCAL_STORE_NAME, { keyPath: 'id' });
  },
});

function photoReference(photo: Photo) {
  const objectPath = photo.objectPath ?? photo.downloadUrl;
  return objectPath ? {
    photoId: photo.id,
    objectPath,
    ...(photo.thumbnailObjectPath ? { thumbnailObjectPath: photo.thumbnailObjectPath } : {}),
  } : undefined;
}

function toAggregate(report: ReportData): ReportAggregatePayload {
  if (!report.agencyId) throw new Error('agencyId is required before saving a cloud report.');
  const metadata: ReportAggregatePayload['report'] = {
    id: report.id,
    agencyId: report.agencyId,
    propertyId: report.propertyId,
    tenancyId: report.tenancyId,
    inspectionJobId: report.inspectionJobId,
    lifecycleStatus: report.lifecycleStatus ?? 'draft',
    reportType: report.reportType,
    propertyAddress: report.propertyAddress,
    clientName: report.clientName,
    tenantName: report.tenantName,
    inspectionDate: report.inspectionDate,
    agentName: report.agentName,
    agentCompany: report.agentCompany,
    agentAddress: report.agentAddress,
    agentPhone: report.agentPhone,
    agentEmail: report.agentEmail,
    previousReportNotes: report.previousReportNotes,
    currentVersionId: report.currentVersionId,
    issuedAt: report.issuedAt,
    tenantReviewDueAt: report.tenantReviewDueAt,
    finalisedAt: report.finalisedAt,
    ownerUid: report.ownerUid,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    version: report.version,
  };
  for (const [key, value] of Object.entries(metadata)) if (value === undefined) delete metadata[key];

  return {
    report: metadata,
    areas: report.rooms.map((room, areaIndex) => {
      const references = room.photos.map(photoReference).filter((value): value is NonNullable<typeof value> => Boolean(value));
      return {
        id: room.id,
        name: room.name,
        sequence: areaIndex + 1,
        ...(room.overallComment ? { overallCommentary: room.overallComment } : {}),
        components: room.items.map((item) => ({
          id: item.id,
          component: item.name,
          visibility: references.length ? 'visible' : 'not_visible',
          testingMethod: 'not_tested',
          conditionCategory: item.isUndamaged ? 'intact' : 'repair_required',
          cleanlinessCategory: item.isClean ? 'clean' : 'requires_cleaning',
          workingStatus: 'untested',
          testStatus: 'untested',
          defects: item.isUndamaged ? [] : [item.comment || 'Condition issue recorded.'],
          maintenanceRequired: !item.isUndamaged,
          commentary: item.comment || `${item.name} assessed during inspection.`,
          photoReferences: references,
          reviewStatus: room.status === 'complete' ? 'reviewer_approved' : room.status === 'analyzed' ? 'ai_generated' : 'draft',
          comparisonStatus: 'not_compared',
        })),
      };
    }),
    ...(report.version ? { expectedVersion: report.version } : {}),
  };
}

async function resolvedPhoto(reference: AggregateComponent['photoReferences'][number]): Promise<Photo> {
  const objectPath = reference.thumbnailObjectPath ?? reference.objectPath;
  let urlPromise = resolvedPhotoUrls.get(objectPath);
  if (!urlPromise) {
    urlPromise = storage
      ? getDownloadURL(storageRef(storage, objectPath)).catch(() => reference.objectPath)
      : Promise.resolve(reference.objectPath);
    resolvedPhotoUrls.set(objectPath, urlPromise);
  }
  const previewUrl = await urlPromise;
  const name = reference.objectPath.split('/').at(-1) ?? reference.photoId;
  return {
    id: reference.photoId,
    file: new File([], name),
    previewUrl,
    downloadUrl: previewUrl,
    objectPath: reference.objectPath,
    ...(reference.thumbnailObjectPath ? { thumbnailObjectPath: reference.thumbnailObjectPath } : {}),
  };
}

function reportMetadata(metadata: ReportAggregatePayload['report'], rooms: Room[] = []): ReportData {
  return {
    id: metadata.id,
    agencyId: metadata.agencyId,
    propertyId: metadata.propertyId as string | undefined,
    tenancyId: metadata.tenancyId as string | undefined,
    inspectionJobId: metadata.inspectionJobId as string | undefined,
    lifecycleStatus: metadata.lifecycleStatus as ReportData['lifecycleStatus'],
    currentVersionId: metadata.currentVersionId as string | undefined,
    issuedAt: metadata.issuedAt as string | undefined,
    tenantReviewDueAt: metadata.tenantReviewDueAt as string | undefined,
    finalisedAt: metadata.finalisedAt as string | undefined,
    propertyAddress: String(metadata.propertyAddress ?? ''),
    agentName: String(metadata.agentName ?? ''),
    agentCompany: String(metadata.agentCompany ?? ''),
    agentAddress: metadata.agentAddress as string | undefined,
    agentPhone: metadata.agentPhone as string | undefined,
    agentEmail: metadata.agentEmail as string | undefined,
    clientName: String(metadata.clientName ?? ''),
    inspectionDate: String(metadata.inspectionDate ?? ''),
    tenantName: String(metadata.tenantName ?? ''),
    reportType: String(metadata.reportType ?? ''),
    previousReportNotes: metadata.previousReportNotes as string | undefined,
    rooms,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    ownerUid: metadata.ownerUid as string | undefined,
    version: metadata.version,
  };
}

async function fromAggregate(aggregate: ReportAggregatePayload): Promise<ReportData> {
  const rooms = await Promise.all(aggregate.areas.map(async (area): Promise<Room> => {
    const references = new Map<string, AggregateComponent['photoReferences'][number]>();
    for (const component of area.components) for (const reference of component.photoReferences) references.set(reference.photoId, reference);
    const photos = await Promise.all([...references.values()].map(resolvedPhoto));
    return {
      id: area.id,
      name: area.name,
      status: area.components.every((component) => component.reviewStatus === 'reviewer_approved') ? 'complete' : 'draft',
      items: area.components.map((component) => ({
        id: component.id,
        name: component.component,
        isClean: component.cleanlinessCategory === 'clean',
        isUndamaged: !['repair_required', 'replacement_recommended'].includes(component.conditionCategory),
        isWorking: component.workingStatus === 'operation_confirmed',
        comment: component.commentary,
      })),
      photos,
      overallComment: area.overallCommentary ?? '',
    };
  }));
  return reportMetadata(aggregate.report, rooms);
}

export const saveReportToDB = async (report: ReportData, dirtyScopeId = `report:${report.id}`): Promise<ReportData> => {
  const timestamp = new Date().toISOString();
  const prepared = { ...report, createdAt: report.createdAt || timestamp, updatedAt: timestamp };
  if (!isFirebaseConfigured() || !auth) {
    return runShellOperation({
      kind: 'save', title: 'Saving report', source: LOCAL_STORE_NAME, persistence: 'local',
      dirtyScopeId, entityType: 'report', entityId: report.id,
      action: report.createdAt ? 'update' : 'create', announceSuccess: true,
    }, async () => {
      const localDB = await initLocalDB();
      await localDB.put(LOCAL_STORE_NAME, prepared);
      return prepared;
    });
  }
  const stored = await apiRequest<ReportAggregatePayload>(report.agencyId, `/api/v1/reports/${report.id}/aggregate`, {
    method: 'PUT',
    body: toAggregate(prepared),
    dirtyScopeId,
    entityType: 'report',
    entityId: report.id,
    action: report.createdAt ? 'update' : 'create',
    baseVersion: (report as ReportData & { version?: number }).version,
    queueWhenOffline: true,
    announceSuccess: true,
  });
  return fromAggregate(stored);
};

export const loadReportFromDB = async (id: string): Promise<ReportData | undefined> => {
  if (!isFirebaseConfigured() || !auth) return (await initLocalDB()).get(LOCAL_STORE_NAME, id);
  try {
    return await fromAggregate(await apiRequest<ReportAggregatePayload>(undefined, `/api/v1/reports/${id}/aggregate`));
  } catch (error) {
    if ((error as { code?: string }).code === 'NOT_FOUND') return undefined;
    throw error;
  }
};

export const getAllSavedReports = async (): Promise<ReportData[]> => {
  if (!isFirebaseConfigured() || !auth) return (await initLocalDB()).getAll(LOCAL_STORE_NAME);
  const reports = await apiRequest<Array<ReportAggregatePayload['report']>>(undefined, '/api/v1/reports');
  return reports.map((metadata) => reportMetadata(metadata));
};

export const deleteReportFromDB = async (id: string): Promise<void> => {
  if (!isFirebaseConfigured() || !auth) {
    await runShellOperation({ kind: 'save', title: 'Deleting report', source: LOCAL_STORE_NAME, persistence: 'local', entityType: 'report', entityId: id, action: 'delete', announceSuccess: true }, async () => {
      await (await initLocalDB()).delete(LOCAL_STORE_NAME, id);
    });
    return;
  }
  const existing = await apiRequest<ReportAggregatePayload>(undefined, `/api/v1/reports/${id}/aggregate`);
  await apiRequest<Record<string, unknown>>(String(existing.report.agencyId), `/api/v1/reports/${id}/transitions`, {
    method: 'POST',
    body: { status: 'cancelled', expectedVersion: existing.report.version ?? 1, reason: 'draft_deleted_by_operator' },
    baseVersion: existing.report.version ?? 1,
    entityType: 'report', entityId: id, action: 'delete', announceSuccess: true,
  });
};
