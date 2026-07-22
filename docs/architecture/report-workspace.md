# Canonical report workspace

`ReportAggregate` is the only forward-looking report write model. The legacy `ReportData`, `Room`, and Boolean assessment types remain a read/recovery format only and are available through `VITE_ENABLE_LEGACY_REPORT_BUILDER=true` during migration.

The v2 workspace lives in `apps/web/features/report-workspace`. Persisted report content and UI state are separated: the aggregate contains report, area, and component facts; selection, panel state, save status, and migration warnings remain in the reducer only.

## Concurrency

- Metadata uses report `version`.
- Components and areas use their own `version`.
- Every content change increments the report `workspaceRevision` for cache invalidation and snapshot identity.
- Editing one component does not require the version of an unrelated component.
- A component conflict returns the server record and submitted patch with HTTP 409.
- Content edits clear stale quality-run and approval references.

## Local recovery

The browser writes schema-v2 recovery snapshots to `proinspect-report-workspaces` before attempting cloud persistence. Draft component patches may enter the authenticated offline queue. Approval, issue, finalisation, destructive deletion, and template lifecycle commands are never queued offline.

Legacy conversion is conservative: Boolean `isWorking` never becomes an operational or passing test claim, and ambiguous room-level evidence is not copied to every component.

## Rollout

The v2 workspace is the default. Set `VITE_ENABLE_LEGACY_REPORT_BUILDER=true` only for a controlled recovery window. Remove the legacy write route after migration reconciliation and two stable releases.
