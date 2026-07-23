import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { InspectionTypeTemplate } from '@pcr/templates';
import type { ReportTemplateAssignment, TemplateRepository } from '@pcr/templates/registry';

function adminApp() {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault() });
}

function templateRef(agencyId: string, templateId: string, version: number) {
  return getFirestore(adminApp()).doc(`agencies/${agencyId}/templates/${templateId}/versions/${version}`);
}

function validLifecycle(existing: InspectionTypeTemplate | undefined, next: InspectionTypeTemplate): boolean {
  if (!existing) return next.status === 'draft';
  if (existing.status === 'draft') return next.status === 'draft' || next.status === 'published';
  if (existing.status === 'published') return next.status === 'published' || next.status === 'retired';
  return next.status === 'retired';
}

function persistedTemplate(template: InspectionTypeTemplate): InspectionTypeTemplate {
  return JSON.parse(JSON.stringify(template)) as InspectionTypeTemplate;
}

export class FirestoreTemplateRepository implements TemplateRepository {
  constructor(private readonly agencyId: string, private readonly actorId = 'system') {}

  async get(id: string, version: number): Promise<InspectionTypeTemplate | undefined> {
    const snapshot = await templateRef(this.agencyId, id, version).get();
    return snapshot.exists ? snapshot.data() as InspectionTypeTemplate : undefined;
  }

  async save(template: InspectionTypeTemplate): Promise<void> {
    const database = getFirestore(adminApp());
    const reference = templateRef(this.agencyId, template.id, template.version);
    const record = persistedTemplate(template);
    await database.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const existing = snapshot.exists ? snapshot.data() as InspectionTypeTemplate : undefined;
      if (!validLifecycle(existing, record)) {
        throw Object.assign(new Error('Template lifecycle transition is not permitted.'), {
          code: existing && existing.status !== 'draft' ? 'TEMPLATE_IMMUTABLE' : 'TEMPLATE_STATE_CONFLICT',
          status: 409,
          details: { from: existing?.status ?? null, to: record.status },
        });
      }
      if (existing?.status === 'published' && record.status === 'published' && JSON.stringify(existing) !== JSON.stringify(record)) {
        throw Object.assign(new Error('Published template content is immutable.'), { code: 'TEMPLATE_IMMUTABLE', status: 409 });
      }
      const timestamp = new Date().toISOString();
      transaction.set(reference, record);
      transaction.set(database.doc(`agencies/${this.agencyId}/templates/${record.id}`), {
        id: record.id,
        agencyId: this.agencyId,
        inspectionType: record.inspectionType,
        jurisdiction: record.jurisdiction ?? null,
        status: record.status,
        ...(record.status === 'published' ? { currentPublishedVersion: record.version } : {}),
        updatedAt: timestamp,
        updatedBy: this.actorId,
      }, { merge: true });
      if (record.status === 'published' && existing?.status !== 'published') {
        const eventId = `${record.id}-${record.version}-published`;
        transaction.set(database.doc(`agencies/${this.agencyId}/outboxEvents/${eventId}`), {
          id: eventId, agencyId: this.agencyId, eventType: 'template.published', aggregateType: 'template',
          aggregateId: record.id, aggregateVersion: record.version, payload: { templateId: record.id, version: record.version, contentHash: record.contentHash ?? null },
          correlationId: eventId, status: 'pending', attempt: 0, availableAt: timestamp, createdAt: timestamp,
        });
      }
      if (record.status === 'retired' && existing?.status === 'published') {
        const eventId = `${record.id}-${record.version}-retired`;
        transaction.set(database.doc(`agencies/${this.agencyId}/outboxEvents/${eventId}`), {
          id: eventId, agencyId: this.agencyId, eventType: 'template.retired', aggregateType: 'template',
          aggregateId: record.id, aggregateVersion: record.version, payload: { templateId: record.id, version: record.version },
          correlationId: eventId, status: 'pending', attempt: 0, availableAt: timestamp, createdAt: timestamp,
        });
      }
    });
  }

  async list(id?: string): Promise<InspectionTypeTemplate[]> {
    if (id) {
      const snapshot = await getFirestore(adminApp()).collection(`agencies/${this.agencyId}/templates/${id}/versions`).orderBy('version').get();
      return snapshot.docs.map((document) => document.data() as InspectionTypeTemplate);
    }
    const templates = await getFirestore(adminApp()).collection(`agencies/${this.agencyId}/templates`).get();
    const versions = await Promise.all(templates.docs.map((template) => template.ref.collection('versions').get()));
    return versions.flatMap((snapshot) => snapshot.docs.map((document) => document.data() as InspectionTypeTemplate))
      .sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
  }

  async findAssignment(reportId: string): Promise<ReportTemplateAssignment | undefined> {
    const snapshot = await getFirestore(adminApp()).doc(`agencies/${this.agencyId}/reports/${reportId}/templateAssignment/current`).get();
    return snapshot.exists ? snapshot.data() as ReportTemplateAssignment : undefined;
  }

  async saveAssignment(assignment: ReportTemplateAssignment): Promise<void> {
    const database = getFirestore(adminApp());
    const reference = database.doc(`agencies/${this.agencyId}/reports/${assignment.reportId}/templateAssignment/current`);
    await database.runTransaction(async (transaction) => {
      const existing = await transaction.get(reference);
      if (existing.exists) {
        const stored = existing.data() as ReportTemplateAssignment;
        if (stored.templateId !== assignment.templateId || stored.templateVersion !== assignment.templateVersion) {
          throw Object.assign(new Error('Report template assignment is immutable.'), { code: 'TEMPLATE_ASSIGNMENT_IMMUTABLE', status: 409 });
        }
        return;
      }
      const template = await transaction.get(templateRef(this.agencyId, assignment.templateId, assignment.templateVersion));
      if (!template.exists || (template.data() as InspectionTypeTemplate).status !== 'published') {
        throw Object.assign(new Error('Only a published template version can be assigned.'), { code: 'PUBLISHED_TEMPLATE_REQUIRED', status: 409 });
      }
      transaction.create(reference, { ...assignment, agencyId: this.agencyId, assignedBy: this.actorId, immutable: true });
    });
  }
}
