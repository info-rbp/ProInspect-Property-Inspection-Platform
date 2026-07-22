import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DurableMediaProcessor, type MediaTask, type MediaTaskStore, type ProcessedEvidence } from './index.js';

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);

class Store implements MediaTaskStore {
  task: MediaTask;
  result?: ProcessedEvidence;
  constructor(task: MediaTask) { this.task = task; }
  async get() { return this.task; }
  async getResult() { return this.result; }
  async saveTask(task: MediaTask) { this.task = task; }
  async saveResult(result: ProcessedEvidence) { this.result = result; }
}

describe('durable media processing', () => {
  it('validates the immutable original and deduplicates task delivery', async () => {
    const store = new Store({ id: 'task-1', agencyId: 'a1', evidenceId: 'e1', objectPath: 'original.jpg', generation: '7', declaredContentType: 'image/jpeg', sha256: createHash('sha256').update(jpeg).digest('hex'), attempt: 0, maxAttempts: 3, status: 'queued' });
    let transforms = 0;
    const processor = new DurableMediaProcessor(store, { async read() { return jpeg; } }, { async transform() { transforms += 1; return { derivatives: [], metadata: { width: 1, height: 1, locationMetadataRemoved: true } }; } });
    expect((await processor.process('task-1')).status).toBe('available');
    expect((await processor.process('task-1')).status).toBe('available');
    expect(transforms).toBe(1);
  });

  it('rejects executable or mismatched content signatures', async () => {
    const bytes = new TextEncoder().encode('#!/bin/sh');
    const store = new Store({ id: 'task-2', agencyId: 'a1', evidenceId: 'e2', objectPath: 'fake.jpg', generation: '1', declaredContentType: 'image/jpeg', sha256: createHash('sha256').update(bytes).digest('hex'), attempt: 0, maxAttempts: 3, status: 'queued' });
    const processor = new DurableMediaProcessor(store, { async read() { return bytes; } }, { async transform() { return { derivatives: [], metadata: { locationMetadataRemoved: true } }; } });
    await expect(processor.process('task-2')).rejects.toThrow('signature');
    expect(store.task.status).toBe('rejected');
  });
});
