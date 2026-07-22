import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleAuth } from 'google-auth-library';

export interface OutboxEvent {
  id: string; agencyId: string; eventType: string; aggregateType: string; aggregateId: string; aggregateVersion: number;
  payload: Record<string, unknown>; correlationId: string; status: 'pending' | 'publishing' | 'published' | 'failed' | 'dead_lettered';
  attempt: number; maxAttempts?: number; availableAt: string; createdAt: string; publishedAt?: string; failureCode?: string;
}
export interface OutboxStore { get(id: string): Promise<OutboxEvent | undefined>; claim(id: string, at: string): Promise<OutboxEvent | undefined>; save(event: OutboxEvent): Promise<void> }
export interface EventPublisher { publish(event: OutboxEvent): Promise<void> }

export class DurableOutboxProcessor {
  constructor(private readonly store: OutboxStore, private readonly publisher: EventPublisher) {}
  async process(eventId: string, at = new Date().toISOString()): Promise<OutboxEvent | undefined> {
    const existing = await this.store.get(eventId);
    if (!existing || existing.status === 'published' || existing.status === 'dead_lettered') return existing;
    if (Date.parse(existing.availableAt) > Date.parse(at)) return existing;
    const claimed = await this.store.claim(eventId, at);
    if (!claimed) return this.store.get(eventId);
    try {
      await this.publisher.publish(claimed);
      const published = { ...claimed, status: 'published' as const, publishedAt: at };
      await this.store.save(published); return published;
    } catch (error) {
      const exhausted = claimed.attempt >= (claimed.maxAttempts ?? 8);
      const failed = { ...claimed, status: exhausted ? 'dead_lettered' as const : 'failed' as const, failureCode: error instanceof Error ? error.name : 'PUBLISH_FAILED', availableAt: new Date(Date.parse(at) + Math.min(3600, 2 ** claimed.attempt * 15) * 1000).toISOString() };
      await this.store.save(failed); throw error;
    }
  }
}

function adminApp() { return getApps()[0] ?? initializeApp({ credential: applicationDefault() }); }
export class FirestoreOutboxStore implements OutboxStore {
  constructor(private readonly agencyId: string) {}
  private reference(id: string) { return getFirestore(adminApp()).doc(`agencies/${this.agencyId}/outboxEvents/${id}`); }
  async get(id: string): Promise<OutboxEvent | undefined> { const snapshot = await this.reference(id).get(); return snapshot.exists ? snapshot.data() as OutboxEvent : undefined; }
  async claim(id: string, at: string): Promise<OutboxEvent | undefined> {
    return getFirestore(adminApp()).runTransaction(async (transaction) => {
      const reference = this.reference(id); const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return undefined; const event = snapshot.data() as OutboxEvent;
      if (!['pending', 'failed'].includes(event.status) || Date.parse(event.availableAt) > Date.parse(at)) return undefined;
      const claimed = { ...event, status: 'publishing' as const, attempt: event.attempt + 1 };
      transaction.set(reference, claimed); return claimed;
    });
  }
  async save(event: OutboxEvent): Promise<void> { await this.reference(event.id).set(event, { merge: true }); }
}

export class PubSubEventPublisher implements EventPublisher {
  private readonly auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/pubsub'] });
  constructor(private readonly projectId = process.env.GOOGLE_CLOUD_PROJECT ?? '', private readonly topic = process.env.OUTBOX_TOPIC ?? 'proinspect-domain-events') {}
  async publish(event: OutboxEvent): Promise<void> {
    if (!this.projectId) throw new Error('GOOGLE_CLOUD_PROJECT is required for outbox publishing.');
    const client = await this.auth.getClient(); const token = await client.getAccessToken();
    const response = await fetch(`https://pubsub.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/topics/${encodeURIComponent(this.topic)}:publish`, {
      method: 'POST', headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ data: Buffer.from(JSON.stringify(event)).toString('base64'), attributes: { eventId: event.id, eventType: event.eventType, aggregateVersion: String(event.aggregateVersion), agencyId: event.agencyId } }] }),
    });
    if (!response.ok) throw new Error(`Pub/Sub publish failed with status ${response.status}.`);
  }
}

export async function processOutboxEvent(agencyId: string, eventId: string): Promise<OutboxEvent | undefined> {
  return new DurableOutboxProcessor(new FirestoreOutboxStore(agencyId), new PubSubEventPublisher()).process(eventId);
}
