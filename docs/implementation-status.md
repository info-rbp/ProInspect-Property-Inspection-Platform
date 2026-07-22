# Technical plan implementation status

Reviewed against `ProInspect_Repository_Technical_Implementation_Plan.docx` on 22 July 2026.

## Implemented in this repository

| Plan area | Repository implementation |
| --- | --- |
| Canonical workspace and templates | Decomposed report aggregate, WA Entry/Routine/Exit published presets, immutable materialised assignments, optimistic entity revisions and legacy migration adapter |
| Booking and work allocation | Recoverable idempotent booking command, assignee-role checks, conflict checks, assignment history, work queue and booking UI |
| Evidence pipeline | Resumable sessions, hash/size/type/generation verification, immutable originals, durable image/video media processor, derivatives and evidence linker |
| Workflow and quality | Named server commands, deterministic quality rules, waivers, analyst/reviewer separation, revision-bound rounds/comments and review UI |
| AI | Firestore task claim/deduplication, Vertex model gateway, grounded claim validation, safety constraints, usage capture, retry/dead-letter state |
| PDF and archive | Deterministic canonical input, Chromium renderer, immutable PDF/JSON/manifest writes and manifest verification |
| Commercial workflows | Source/import, evidence vault, phrases, summaries, secure delivery and canonical CSV/integration contracts |
| Operational workflows | Maintenance, Entry/Exit comparison, tenant invitation, access/key, communication, branding, offline package records and guarded commands |
| Managed services | Service orders, field attendance, portfolio audits, evidence packs, entitlements, capacity and usage records; unified Service Operations UI |
| Cross-cutting | Capabilities, agency isolation, API-only writes, rules/indexes, transactional outbox publisher, OpenAPI, CI, unit/rules/browser foundations and runbooks |

## Activation dependencies outside the repository

The following cannot be truthfully completed by source code alone and remain disabled until their named inputs are supplied and staging acceptance is recorded:

- selected PMS provider, sandbox tenant, OAuth application, scopes, webhook keys and provider certification;
- production Firebase/Google Cloud projects, workload identities, buckets, Pub/Sub topic, Cloud Tasks routes, Vertex quota and Chromium/FFmpeg runtime images;
- email and SMS providers, verified sender identities, DNS records, templates and bounce/webhook configuration;
- approved tenant identity, no-response, retention, legal-hold, redaction, jurisdiction and access-encryption policies;
- agency branding, custom domains, commercial plans, service areas, SLA/fair-use rules and subcontractor approvals;
- monitoring destinations, on-call ownership, backup/restore rehearsal, penetration testing, accessibility device testing and product acceptance.

No provider is emulated and no test credential is embedded. Integration and communication records store Secret Manager references only; feature activation must remain off until the relevant dependency is approved.

## Release decision

The repository is an implementation candidate, not a declaration of production readiness. Promote only after `npm run check`, Firebase emulator tests, the browser matrix, infrastructure plan, migration dry run, backup restoration, security review and the exact phase acceptance workflow pass in staging.
