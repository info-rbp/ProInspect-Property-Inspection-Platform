# Evidence pipeline

Upload-session creation and completion use the shared authenticated API client, carrying Firebase identity, App Check when configured, agency scope, correlation ID, and idempotency key. Only the issued resumable Storage URL is called directly.

Completion re-reads the server-side upload session and Cloud Storage object metadata. It validates session ownership, object path, generation, size, content type, and declared SHA-256 before creating immutable `PhotoEvidenceRecord` metadata and a processing job. Original object paths use an `ifGenerationMatch: 0` precondition and cannot be replaced silently.

Component evidence is represented explicitly. Legacy `photoReferences` remain in snapshots for compatibility, while `EvidenceLink` carries report, area/component, purpose, order, and caption. Area evidence remains area-level until a user or controlled service links it.

Browser writes to original, derived, and final evidence paths are denied by Storage Rules. Failed validation leaves evidence unavailable to readiness gates and produces a retryable operational record.
