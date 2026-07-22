import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { sha256, type GeneratedPackageRecord, type PackageObjectWriter, type PdfPackageStore } from '../index.js';

function adminApp() {
  return getApps()[0] ?? initializeApp({ credential: applicationDefault() });
}

export class FirebasePackageObjectWriter implements PackageObjectWriter {
  constructor(private readonly bucketName = process.env.FINAL_ASSET_BUCKET ?? '') {}

  async write(objectPath: string, content: Uint8Array, contentType: string): Promise<{ objectPath: string; generation: string; sha256: string }> {
    if (!this.bucketName) throw new Error('FINAL_ASSET_BUCKET is required for immutable package generation.');
    const file = getStorage(adminApp()).bucket(this.bucketName).file(objectPath);
    const digest = sha256(content);
    try {
      await file.save(Buffer.from(content), {
        contentType,
        resumable: false,
        metadata: { metadata: { sha256: digest, immutable: 'true' }, cacheControl: 'private, max-age=31536000, immutable' },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      const [exists] = await file.exists();
      if (!exists) throw error;
    }
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.sha256 !== digest) throw new Error(`Immutable object collision for ${objectPath}.`);
    return { objectPath, generation: String(metadata.generation), sha256: digest };
  }
}

export class FirestorePdfPackageStore implements PdfPackageStore {
  constructor(private readonly agencyId: string) {}
  private reference(renderId: string) { return getFirestore(adminApp()).doc(`agencies/${this.agencyId}/pdfPackages/${renderId}`); }
  async get(renderId: string): Promise<GeneratedPackageRecord | undefined> {
    const snapshot = await this.reference(renderId).get();
    return snapshot.exists ? snapshot.data() as GeneratedPackageRecord : undefined;
  }
  async save(record: GeneratedPackageRecord): Promise<void> {
    await getFirestore(adminApp()).runTransaction(async (transaction) => {
      const reference = this.reference(record.id);
      const existing = await transaction.get(reference);
      if (existing.exists) return;
      transaction.create(reference, { ...record, agencyId: this.agencyId, immutable: true });
    });
  }
}
