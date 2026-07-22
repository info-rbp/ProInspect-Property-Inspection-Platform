# Backup and restore

Back up Firestore and both original/final Storage buckets with retention matching agency policy. A release is not production-ready until a sampled restore into an isolated project verifies record counts, immutable object generations, SHA-256 manifests and agency boundaries. Record export IDs, restore duration and exceptions. Never restore over production as a rehearsal.
