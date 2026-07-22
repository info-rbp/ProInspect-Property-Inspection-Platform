import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import {
  DurableMediaProcessor,
  type MediaDerivative,
  type MediaTask,
  type MediaTaskStore,
  type MediaTransformer,
  type OriginalReader,
  type ProcessedEvidence,
} from './index.js';

function adminApp() { return getApps()[0] ?? initializeApp({ credential: applicationDefault() }); }

export class FirebaseOriginalReader implements OriginalReader {
  constructor(private readonly bucketName = process.env.UPLOAD_BUCKET ?? '') {}
  async read(objectPath: string, generation: string): Promise<Uint8Array> {
    if (!this.bucketName) throw new Error('UPLOAD_BUCKET is required.');
    const [bytes] = await getStorage(adminApp()).bucket(this.bucketName).file(objectPath, { generation }).download();
    return bytes;
  }
}

export class FirestoreMediaTaskStore implements MediaTaskStore {
  constructor(private readonly agencyId: string) {}
  private task(taskId: string) { return getFirestore(adminApp()).doc(`agencies/${this.agencyId}/photoProcessingJobs/${taskId}`); }
  private result(taskId: string) { return getFirestore(adminApp()).doc(`agencies/${this.agencyId}/mediaResults/${taskId}`); }
  async get(taskId: string): Promise<MediaTask | undefined> { const snapshot = await this.task(taskId).get(); return snapshot.exists ? snapshot.data() as MediaTask : undefined; }
  async getResult(taskId: string): Promise<ProcessedEvidence | undefined> { const snapshot = await this.result(taskId).get(); return snapshot.exists ? snapshot.data() as ProcessedEvidence : undefined; }
  async saveTask(task: MediaTask): Promise<void> { await this.task(task.id).set({ ...task, updatedAt: new Date().toISOString() }, { merge: true }); }
  async saveResult(result: ProcessedEvidence): Promise<void> {
    await getFirestore(adminApp()).runTransaction(async (transaction) => {
      const resultReference = this.result(result.taskId);
      const existing = await transaction.get(resultReference);
      if (!existing.exists) transaction.create(resultReference, { ...result, agencyId: this.agencyId, immutable: true });
      transaction.set(getFirestore(adminApp()).doc(`agencies/${this.agencyId}/photoEvidence/${result.evidenceId}`), {
        processingStatus: 'available', derivatives: result.derivatives, detectedContentType: result.detectedContentType,
        mediaMetadata: result.metadata, updatedAt: result.processedAt,
      }, { merge: true });
    });
  }
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let errorOutput = '';
    child.stderr.on('data', (chunk: Buffer) => { if (errorOutput.length < 4000) errorOutput += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Media transform failed with exit code ${code}: ${errorOutput.slice(-1000)}`)));
  });
}

export class FirebaseMediaTransformer implements MediaTransformer {
  constructor(private readonly bucketName = process.env.UPLOAD_BUCKET ?? '', private readonly ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg') {}

  private async write(task: MediaTask, kind: MediaDerivative['kind'], bytes: Uint8Array, contentType: string, extension: string, dimensions?: { width?: number; height?: number }): Promise<MediaDerivative> {
    if (!this.bucketName) throw new Error('UPLOAD_BUCKET is required.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const objectPath = `inspection-derived/agencies/${task.agencyId}/evidence/${task.evidenceId}/${kind}-${task.generation}.${extension}`;
    const file = getStorage(adminApp()).bucket(this.bucketName).file(objectPath);
    try {
      await file.save(Buffer.from(bytes), { resumable: false, contentType, metadata: { cacheControl: 'private, max-age=31536000, immutable', metadata: { sha256: digest, sourceGeneration: task.generation } }, preconditionOpts: { ifGenerationMatch: 0 } });
    } catch (error) { const [exists] = await file.exists(); if (!exists) throw error; }
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.sha256 !== digest) throw Object.assign(new Error(`Derivative collision for ${kind}.`), { permanent: true });
    return { kind, objectPath, generation: String(metadata.generation), sha256: digest, contentType, ...dimensions };
  }

  async transform(input: Uint8Array, detectedContentType: string, task: MediaTask): Promise<{ derivatives: MediaDerivative[]; metadata: ProcessedEvidence['metadata'] }> {
    if (detectedContentType.startsWith('image/')) {
      const base = sharp(input, { failOn: 'error' }).rotate();
      const metadata = await base.metadata();
      const thumbnail = await base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      const display = await base.clone().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      return {
        derivatives: [
          await this.write(task, 'thumbnail', thumbnail, 'image/webp', 'webp'),
          await this.write(task, 'display', display, 'image/webp', 'webp'),
        ],
        metadata: { width: metadata.width, height: metadata.height, locationMetadataRemoved: true },
      };
    }

    const directory = await mkdtemp(join(tmpdir(), 'proinspect-media-'));
    try {
      const source = join(directory, 'source.mp4'); const posterPath = join(directory, 'poster.jpg'); const streamPath = join(directory, 'stream.mp4');
      await writeFile(source, input);
      await run(this.ffmpegPath, ['-nostdin', '-v', 'error', '-i', source, '-frames:v', '1', '-vf', 'scale=min(1280\\,iw):-2', '-map_metadata', '-1', posterPath]);
      await run(this.ffmpegPath, ['-nostdin', '-v', 'error', '-i', source, '-map_metadata', '-1', '-movflags', '+faststart', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-c:a', 'aac', '-b:a', '128k', streamPath]);
      const [poster, stream] = await Promise.all([readFile(posterPath), readFile(streamPath)]);
      return { derivatives: [await this.write(task, 'video_poster', poster, 'image/jpeg', 'jpg'), await this.write(task, 'video_stream', stream, 'video/mp4', 'mp4')], metadata: { locationMetadataRemoved: true } };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
}

export async function processMediaTask(agencyId: string, taskId: string): Promise<ProcessedEvidence> {
  return new DurableMediaProcessor(new FirestoreMediaTaskStore(agencyId), new FirebaseOriginalReader(), new FirebaseMediaTransformer()).process(taskId);
}
