import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import type { AnalysisResult, AnalysisTask, AnalysisTaskStore } from '../index.js';

function adminApp() {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault() });
}

export class FirestoreAnalysisTaskStore implements AnalysisTaskStore {
  constructor(private readonly agencyId: string) {}

  private task(taskId: string) {
    return getFirestore(adminApp()).doc(`agencies/${this.agencyId}/analysisJobs/${taskId}`);
  }

  async get(taskId: string): Promise<AnalysisTask | undefined> {
    const snapshot = await this.task(taskId).get();
    return snapshot.exists ? snapshot.data() as AnalysisTask : undefined;
  }

  async save(task: AnalysisTask): Promise<void> {
    if (task.agencyId !== this.agencyId) throw new Error('Analysis task agency mismatch.');
    await this.task(task.id).set(task, { merge: true });
  }

  async getResult(taskId: string): Promise<AnalysisResult | undefined> {
    const snapshot = await this.task(taskId).collection('results').doc('current').get();
    return snapshot.exists ? snapshot.data() as AnalysisResult : undefined;
  }

  async saveResult(result: AnalysisResult): Promise<void> {
    const reference = this.task(result.taskId).collection('results').doc('current');
    await getFirestore(adminApp()).runTransaction(async (transaction) => {
      const taskReference = this.task(result.taskId);
      const taskSnapshot = await transaction.get(taskReference);
      if (!taskSnapshot.exists) throw new Error('Analysis task is missing while saving its result.');
      const task = taskSnapshot.data() as AnalysisTask;
      const reportReference = getFirestore(adminApp()).doc(`agencies/${this.agencyId}/reports/${task.reportId}`);
      const eventReference = getFirestore(adminApp()).doc(`agencies/${this.agencyId}/outboxEvents/analysis-${task.id}`);
      const projectedResultReference = getFirestore(adminApp()).doc(`agencies/${this.agencyId}/analysisResults/${task.id}`);
      const [existing, reportSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(reference), transaction.get(reportReference), transaction.get(eventReference),
      ]);
      if (existing.exists) return;
      const report = reportSnapshot.data() as Record<string, unknown> | undefined;
      const applicable = Boolean(report && Number(report.workspaceRevision) === Number(task.workspaceRevision));
      transaction.create(reference, { ...result, immutable: true, applicability: applicable ? 'current' : 'superseded' });
      transaction.set(projectedResultReference, { ...result, id: task.id, agencyId: this.agencyId, applicability: applicable ? 'current' : 'superseded', immutable: true, version: 1, createdAt: result.completedAt, updatedAt: result.completedAt });
      if (applicable && report && ['analysis_queued', 'analysis_running'].includes(String(report.lifecycleStatus))) {
        transaction.set(reportReference, { lifecycleStatus: 'analysis_complete', analysisResultId: task.id, version: Number(report.version ?? 0) + 1, updatedAt: result.completedAt, updatedBy: 'ai-worker' }, { merge: true });
      }
      if (!eventSnapshot.exists) transaction.create(eventReference, {
        id: `analysis-${task.id}`, agencyId: this.agencyId, eventType: 'analysis.completed', aggregateType: 'report',
        aggregateId: task.reportId, aggregateVersion: Number(report?.version ?? 0) + (applicable ? 1 : 0),
        payload: { taskId: task.id, reportVersionId: task.reportVersionId, workspaceRevision: task.workspaceRevision, applicability: applicable ? 'current' : 'superseded' },
        correlationId: task.id, status: 'pending', attempt: 0, availableAt: result.completedAt, createdAt: result.completedAt,
      });
      const auditId = randomUUID();
      transaction.create(getFirestore(adminApp()).doc(`agencies/${this.agencyId}/auditEvents/${auditId}`), {
        id: auditId, agencyId: this.agencyId, entityType: 'analysis_task', entityId: task.id, eventType: 'analysis.completed',
        actorId: 'ai-worker', timestamp: result.completedAt, correlationId: task.id, metadata: { reportId: task.reportId, applicability: applicable ? 'current' : 'superseded' },
      });
    });
  }

  async claim(taskId: string, now: string): Promise<AnalysisTask | undefined> {
    const reference = this.task(taskId);
    return getFirestore(adminApp()).runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return undefined;
      const task = snapshot.data() as AnalysisTask;
      const reportReference = getFirestore(adminApp()).doc(`agencies/${this.agencyId}/reports/${task.reportId}`);
      const reportSnapshot = await transaction.get(reportReference);
      if (task.agencyId !== this.agencyId || !['queued', 'retryable_failure'].includes(task.status)) return undefined;
      if (task.attempt >= task.maxAttempts) {
        transaction.update(reference, { status: 'dead_lettered', failureCode: 'ATTEMPTS_EXHAUSTED', updatedAt: now });
        return undefined;
      }
      const claimed: AnalysisTask = { ...task, status: 'running', attempt: task.attempt + 1, startedAt: now, updatedAt: now };
      transaction.set(reference, claimed);
      const report = reportSnapshot.data() as Record<string, unknown> | undefined;
      if (report && report.lifecycleStatus === 'analysis_queued' && Number(report.workspaceRevision) === Number(task.workspaceRevision)) {
        transaction.set(reportReference, { lifecycleStatus: 'analysis_running', version: Number(report.version ?? 0) + 1, updatedAt: now, updatedBy: 'ai-worker' }, { merge: true });
      }
      return claimed;
    });
  }
}
