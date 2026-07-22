import { describe, expect, it } from 'vitest';
import { DurableOutboxProcessor, type OutboxEvent, type OutboxStore } from './index.js';

class MemoryStore implements OutboxStore {
  constructor(public event: OutboxEvent) {}
  async get() { return structuredClone(this.event); }
  async claim(_id: string, _at: string) { if (!['pending', 'failed'].includes(this.event.status)) return undefined; this.event = { ...this.event, status: 'publishing', attempt: this.event.attempt + 1 }; return structuredClone(this.event); }
  async save(event: OutboxEvent) { this.event = structuredClone(event); }
}
const event = (): OutboxEvent => ({ id: 'event-1', agencyId: 'agency-1', eventType: 'report.approved', aggregateType: 'report', aggregateId: 'report-1', aggregateVersion: 2, payload: {}, correlationId: 'correlation-1', status: 'pending', attempt: 0, availableAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' });
describe('durable outbox', () => {
  it('publishes once and replays the published result', async () => { const store = new MemoryStore(event()); let calls = 0; const worker = new DurableOutboxProcessor(store, { async publish() { calls += 1; } }); expect((await worker.process('event-1', '2026-01-02T00:00:00Z'))?.status).toBe('published'); await worker.process('event-1'); expect(calls).toBe(1); });
  it('backs off retryable failures', async () => { const store = new MemoryStore(event()); const worker = new DurableOutboxProcessor(store, { async publish() { throw new Error('down'); } }); await expect(worker.process('event-1', '2026-01-02T00:00:00Z')).rejects.toThrow('down'); expect(store.event.status).toBe('failed'); expect(Date.parse(store.event.availableAt)).toBeGreaterThan(Date.parse('2026-01-02T00:00:00Z')); });
});
