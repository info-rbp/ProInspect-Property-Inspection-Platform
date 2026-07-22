import { createHash } from 'node:crypto';

export type MediaTaskStatus = 'queued' | 'validating' | 'transforming' | 'available' | 'rejected' | 'retryable_failure' | 'dead_lettered';

export interface MediaTask {
  id: string;
  agencyId: string;
  evidenceId: string;
  objectPath: string;
  generation: string;
  declaredContentType: string;
  sha256: string;
  attempt: number;
  maxAttempts: number;
  status: MediaTaskStatus;
}

export interface MediaDerivative {
  kind: 'thumbnail' | 'display' | 'redacted' | 'video_poster' | 'video_stream';
  objectPath: string;
  generation: string;
  sha256: string;
  contentType: string;
  width?: number;
  height?: number;
}

export interface ProcessedEvidence {
  taskId: string;
  evidenceId: string;
  sourceGeneration: string;
  sourceSha256: string;
  detectedContentType: string;
  metadata: { width?: number; height?: number; durationSeconds?: number; locationMetadataRemoved: boolean };
  derivatives: MediaDerivative[];
  status: 'available';
  processedAt: string;
}

export interface MediaTaskStore {
  get(taskId: string): Promise<MediaTask | undefined>;
  getResult(taskId: string): Promise<ProcessedEvidence | undefined>;
  saveTask(task: MediaTask): Promise<void>;
  saveResult(result: ProcessedEvidence): Promise<void>;
}

export interface OriginalReader { read(objectPath: string, generation: string): Promise<Uint8Array>; }
export interface MediaTransformer {
  transform(input: Uint8Array, detectedContentType: string, task: MediaTask): Promise<{ derivatives: MediaDerivative[]; metadata: ProcessedEvidence['metadata'] }>;
}

function detectedType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && String.fromCharCode(...bytes.slice(1, 4)) === 'PNG') return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'video/mp4';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return undefined;
}

export class DurableMediaProcessor {
  constructor(private readonly store: MediaTaskStore, private readonly reader: OriginalReader, private readonly transformer: MediaTransformer) {}

  async process(taskId: string, now = new Date().toISOString()): Promise<ProcessedEvidence> {
    const existing = await this.store.getResult(taskId);
    if (existing) return existing;
    const task = await this.store.get(taskId);
    if (!task) throw new Error(`Media task not found: ${taskId}`);
    if (task.status === 'dead_lettered' || task.status === 'rejected') throw new Error(`Media task cannot be processed from ${task.status}.`);
    const running = { ...task, status: 'validating' as const, attempt: task.attempt + 1 };
    await this.store.saveTask(running);
    try {
      const bytes = await this.reader.read(task.objectPath, task.generation);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== task.sha256) throw Object.assign(new Error('Original evidence hash does not match the upload record.'), { permanent: true });
      const contentType = detectedType(bytes);
      if (!contentType || contentType !== task.declaredContentType) throw Object.assign(new Error('Evidence content signature is not an allowed declared media type.'), { permanent: true });
      await this.store.saveTask({ ...running, status: 'transforming' });
      const transformed = await this.transformer.transform(bytes, contentType, running);
      const result: ProcessedEvidence = {
        taskId, evidenceId: task.evidenceId, sourceGeneration: task.generation, sourceSha256: digest,
        detectedContentType: contentType, metadata: { ...transformed.metadata, locationMetadataRemoved: true },
        derivatives: transformed.derivatives, status: 'available', processedAt: now,
      };
      await this.store.saveResult(result);
      await this.store.saveTask({ ...running, status: 'available' });
      return result;
    } catch (error) {
      const permanent = Boolean((error as { permanent?: boolean }).permanent);
      const exhausted = running.attempt >= running.maxAttempts;
      await this.store.saveTask({ ...running, status: permanent ? 'rejected' : exhausted ? 'dead_lettered' : 'retryable_failure' });
      throw error;
    }
  }
}

export { FirebaseMediaTransformer, FirebaseOriginalReader, FirestoreMediaTaskStore, processMediaTask } from './firebaseMediaPipeline.js';
