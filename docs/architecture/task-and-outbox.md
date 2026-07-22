# Transactional outbox and work queue

Material report writes create an `outboxEvents` record in the same Firestore transaction as the business mutation. Event identity, aggregate version, correlation ID, retry status, attempt count, availability time, and compact payload are persisted before downstream dispatch.

The same transaction updates a compact `workQueueItems/report-{reportId}` projection. The projection contains stage, assignment, priority, blocker/exception fields, and a server-derived next action. The web work queue reads these records rather than scanning report subcollections.

An outbox publisher may claim `pending` events, publish to Pub/Sub or create Cloud Tasks, then mark them `published`. Consumers must deduplicate by event ID and reject stale aggregate versions when ordering matters. Failed events progress through `failed` to `dead_lettered`; operators retry using the original event identity.
