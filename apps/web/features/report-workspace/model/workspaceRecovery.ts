import { openDB } from 'idb';
import type { ReportAggregate } from '@pcr/domain';

const database = () => openDB('proinspect-report-workspaces', 1, {
  upgrade(db) { if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' }); },
});

interface Snapshot { id: string; agencyId: string; reportId: string; aggregate: ReportAggregate; savedAt: string; schemaVersion: 2 }

export async function saveWorkspaceRecovery(agencyId: string, aggregate: ReportAggregate): Promise<void> {
  const snapshot: Snapshot = { id: `${agencyId}:${aggregate.report.id}`, agencyId, reportId: aggregate.report.id, aggregate: structuredClone(aggregate), savedAt: new Date().toISOString(), schemaVersion: 2 };
  await (await database()).put('snapshots', snapshot);
}

export async function loadWorkspaceRecovery(agencyId: string, reportId: string): Promise<Snapshot | undefined> {
  return (await database()).get('snapshots', `${agencyId}:${reportId}`) as Promise<Snapshot | undefined>;
}

export async function clearWorkspaceRecovery(agencyId: string, reportId: string): Promise<void> {
  await (await database()).delete('snapshots', `${agencyId}:${reportId}`);
}
