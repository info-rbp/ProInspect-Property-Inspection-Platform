import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';
import { processPdfTask, type GeneratedPackageRecord, type RenderInput } from './index.js';

function adminApp() { return getApps()[0] ?? initializeApp({ credential: applicationDefault() }); }

export async function processQueuedPdfJob(agencyId: string, taskId: string): Promise<GeneratedPackageRecord> {
  const database = getFirestore(adminApp());
  const taskReference = database.doc(`agencies/${agencyId}/pdfJobs/${taskId}`);
  const taskSnapshot = await taskReference.get();
  if (!taskSnapshot.exists) throw new Error(`PDF task not found: ${taskId}`);
  const task = taskSnapshot.data() as Record<string, unknown>;
  if (task.status === 'ready' && typeof task.packageId === 'string') {
    const existing = await database.doc(`agencies/${agencyId}/pdfPackages/${task.packageId}`).get();
    if (existing.exists) return existing.data() as GeneratedPackageRecord;
  }
  const reportId = String(task.reportId); const reportVersionId = String(task.reportVersionId);
  const reportReference = database.doc(`agencies/${agencyId}/reports/${reportId}`);
  const versionReference = reportReference.collection('versions').doc(reportVersionId);
  const [reportSnapshot, versionSnapshot, areaSnapshot] = await Promise.all([reportReference.get(), versionReference.get(), versionReference.collection('areas').orderBy('sequence').get()]);
  if (!reportSnapshot.exists || !versionSnapshot.exists) throw new Error('The immutable report version required for PDF generation is missing.');
  const report = reportSnapshot.data() as Record<string, unknown>; const version = versionSnapshot.data() as Record<string, unknown>;
  const areas: Array<Record<string, unknown>> = [];
  const assets = new Map<string, RenderInput['assets'][number]>();
  for (const areaDocument of areaSnapshot.docs) {
    const componentSnapshot = await areaDocument.ref.collection('components').orderBy('component').get();
    const components = componentSnapshot.docs.map((document) => document.data() as Record<string, unknown>);
    for (const component of components) {
      const references = Array.isArray(component.photoReferences) ? component.photoReferences as Array<Record<string, unknown>> : [];
      for (const reference of references) {
        if (typeof reference.photoId !== 'string' || typeof reference.objectPath !== 'string' || typeof reference.generation !== 'string' || typeof reference.sha256 !== 'string') throw new Error('PDF generation requires immutable evidence generation and SHA-256 references.');
        assets.set(reference.photoId, { photoId: reference.photoId, objectPath: reference.objectPath, generation: reference.generation, sha256: reference.sha256 });
      }
    }
    areas.push({ ...areaDocument.data(), components });
  }
  const input: RenderInput = {
    agencyId, reportId, reportVersionId, templateId: String(version.templateId ?? task.templateId), templateVersion: Number(version.templateVersion ?? task.templateVersion),
    approvedAt: String(report.reviewerApprovedAt ?? version.createdAt), approvedBy: String(report.updatedBy ?? version.createdBy),
    report: (version.metadataSnapshot as Record<string, unknown> | undefined) ?? report, areas, assets: [...assets.values()],
    outputLayoutVersion: 'report-layout-v1',
  };
  const bucketName = process.env.UPLOAD_BUCKET;
  if (!bucketName && input.assets.length) throw new Error('UPLOAD_BUCKET is required to render report evidence.');
  const renderAssetData: Record<string, string> = {};
  for (const asset of input.assets) {
    const [bytes] = await getStorage(adminApp()).bucket(bucketName!).file(asset.objectPath, { generation: asset.generation }).download();
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Evidence hash verification failed for ${asset.photoId}.`);
    const contentType = /\.png$/iu.test(asset.objectPath) ? 'image/png' : /\.webp$/iu.test(asset.objectPath) ? 'image/webp' : 'image/jpeg';
    renderAssetData[asset.photoId] = `data:${contentType};base64,${bytes.toString('base64')}`;
  }
  input.renderAssetData = renderAssetData;
  await taskReference.set({ status: 'running', startedAt: new Date().toISOString() }, { merge: true });
  try {
    const generated = await processPdfTask(agencyId, input, input.approvedBy);
    await database.runTransaction(async (transaction) => {
      transaction.set(taskReference, { status: 'ready', packageId: generated.id, completedAt: generated.createdAt }, { merge: true });
      const reference = task.packageType === 'final' ? generated.manifestObject : generated.pdf;
      transaction.set(reportReference, task.packageType === 'final'
        ? { archiveReference: { ...reference, createdAt: generated.createdAt }, updatedAt: generated.createdAt }
        : { pdfReference: { ...reference, createdAt: generated.createdAt }, updatedAt: generated.createdAt }, { merge: true });
    });
    return generated;
  } catch (error) {
    await taskReference.set({ status: 'failed', failureCode: error instanceof Error ? error.name : 'PDF_FAILED', updatedAt: new Date().toISOString() }, { merge: true });
    throw error;
  }
}
