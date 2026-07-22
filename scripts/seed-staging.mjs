import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.GOOGLE_CLOUD_PROJECT?.trim();
if (process.env.APP_ENV !== 'staging' || !projectId || !/staging/iu.test(projectId)) {
  throw new Error('Refusing to seed: APP_ENV must be staging and GOOGLE_CLOUD_PROJECT must identify a staging project.');
}

if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const now = new Date().toISOString();
const agencyId = 'synthetic-agency-001';
const propertyId = 'synthetic-property-001';
const jobId = 'synthetic-job-001';
const reportId = 'synthetic-report-001';
const batch = db.batch();

const records = [
  ['agencies', agencyId, { id: agencyId, name: 'Synthetic Staging Realty', status: 'active', synthetic: true, createdAt: now, updatedAt: now }],
  ['users', 'synthetic-admin-001', { id: 'synthetic-admin-001', agencyId, email: 'admin@example.invalid', displayName: 'Staging Admin', role: 'proinspect_admin', status: 'active', synthetic: true, createdAt: now, updatedAt: now }],
  ['properties', propertyId, { id: propertyId, agencyId, address: '1 Staging Test Way', suburb: 'Perth', state: 'WA', postcode: '6000', propertyType: 'house', clientIds: [], status: 'active', version: 1, synthetic: true, createdAt: now, updatedAt: now }],
  ['inspectionJobs', jobId, { id: jobId, agencyId, propertyId, reportType: 'Property Condition Report', status: 'draft', version: 1, synthetic: true, createdAt: now, updatedAt: now }],
  ['reports', reportId, { id: reportId, reportId, agencyId, propertyId, inspectionJobId: jobId, reportType: 'Property Condition Report', propertyAddress: '1 Staging Test Way', lifecycleStatus: 'draft', version: 1, synthetic: true, createdAt: now, updatedAt: now }],
  ['photoEvidence', 'synthetic-photo-001', { id: 'synthetic-photo-001', agencyId, propertyId, inspectionJobId: jobId, reportId, objectPath: 'synthetic/not-a-real-photo.jpg', status: 'metadata_only', synthetic: true, createdAt: now, updatedAt: now }],
];

for (const [collection, id, data] of records) batch.set(db.collection(collection).doc(id), data);
await batch.commit();
console.log(JSON.stringify({ severity: 'INFO', message: 'staging.seed.complete', projectId, records: records.length }));
