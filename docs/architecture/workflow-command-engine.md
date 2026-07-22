# Workflow command engine

Report lifecycle changes use named commands under `/api/v1/reports/{reportId}/commands/{command}`. The generic report transition endpoint returns `410 GENERIC_TRANSITION_DISABLED`.

The server loads current report records, resolves the actor through Firebase identity and active agency membership, constructs `WorkflowGateContext` from persisted state, and invokes `transitionReport` from `@pcr/domain`. Browser-supplied gate flags are ignored.

Supported Phase 1 commands include analysis queueing, analyst review, change requests, independent approval, issue preparation, finalisation, archival, and cancellation. Each command requires an idempotency key and expected report version. Transitions atomically update report/job state, immutable version snapshots where required, audit history, outbox, queue projection, and notification work.

Finalisation requires a verified PDF reference. Archival requires a verified archive reference. Approval requires persisted analyst and reviewer decisions and a current ready/waived quality status.

Operational override remains limited to `proinspect_admin`; the reason must be recorded whenever the destination state requires one.
