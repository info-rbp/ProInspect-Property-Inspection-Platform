# ReportData to ReportAggregate migration

Use `npm run migrate:reports --workspace @pcr/api` for a dry run. Add `--apply` only after a Firestore export and review of every warning. `MIGRATION_LIMIT` bounds each batch and `MIGRATION_AFTER` resumes from the last confirmed document ID.

The migration is idempotent at the destination report ID, retains the source, rejects inline binary data, and records counts and warnings. Legacy working Booleans always become `untested` with `testingMethod=not_tested`; they never become operational claims. Ambiguous evidence relationships require human review.

Reconcile source/destination area, component, and usable evidence counts; confirm schema version and workspace revision; then validate the report through the Phase 1 quality engine. Roll back application traffic to the read-only legacy adapter if reconciliation fails. Do not delete source records during the controlled migration window.
