# Upload failure runbook

1. Locate the upload session, photo-processing job, and correlation ID in the agency work queue.
2. Confirm the session has not expired and the actor remains assigned to the job.
3. Compare the issued object path, size, content type, SHA-256 metadata, and immutable Storage generation.
4. For an interrupted upload, retain the existing session and resume from the persisted byte offset.
5. For a completion-verification failure, do not create evidence metadata manually. Correct the object/session mismatch or issue a new upload session.
6. For a rejected file, preserve the audit record, keep the asset unavailable, and follow the retention policy.

Retrying session creation or completion must use the original idempotency key. Never make an original bucket path public and never overwrite an existing generation.
