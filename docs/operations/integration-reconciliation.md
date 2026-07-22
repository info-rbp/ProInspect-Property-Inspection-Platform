# Integration reconciliation

Pause the connection when authentication or signature verification fails. Inspect cursor, external reference, provider version and the configured source-of-truth policy. Replay events by original idempotency key. Provider-owned fields may update locally; ProInspect-owned fields may be sent outward; manual-review conflicts stay queued. Credentials are rotated in Secret Manager and only the secret version reference changes in Firestore.
