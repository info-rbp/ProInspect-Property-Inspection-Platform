# Batch 3 scale foundations

## Scope

This delivery implements deterministic, repository-complete foundations for the Scale phase. It does not activate external PMS providers, billing providers, cloud archive assembly or production credentials.

## Scale policy engine

The domain package provides:

- effective-dated entitlement resolution and usage limits
- service-level due-date calculation
- optional business-hour SLA calculation
- postcode-based service-area coverage
- service-area operating-day checks using the Australia/Perth timezone
- optimistic capacity reservations
- field-user capacity overlap detection
- usage classification as included, fair-use review or additional fee

All policy failures use stable error codes suitable for API responses and operational reporting.

## Portfolio audit engine

Portfolio audits are generated from explicit property projections. Version 1 evaluates:

- missing final Entry baselines
- overdue inspections
- unresolved high-priority maintenance
- evidence readiness below 80 percent
- repeated access failures
- missing final archives
- incomplete key or access records
- retention exceptions
- turnaround target exceptions

Findings receive deterministic identifiers based on property, category and audit date. Generated audits enter `review_required`; approval requires an identified actor.

## Evidence-pack foundation

Evidence-pack assembly requires:

- approved or assembling status
- documented purpose
- authorised requester
- named privacy reviewer
- one or more evidence records
- a future expiry when expiry is configured
- evidence from the same agency and property
- evidence in available or held state

The manifest is canonicalised and receives a deterministic 64-character content hash. The named API command is:

`POST /api/v1/evidence-packs/{id}/commands/build-manifest`

The command uses optimistic concurrency, idempotency, audit logging and an outbox event.

## Branding lifecycle

Branding versions support:

- validation of identifiers, version, hexadecimal colours and contact details
- publication from draft
- retirement from published
- cloning to a greater version
- immutable published content
- deterministic content hashes

Named API commands are:

- `POST /api/v1/branding-versions/{id}/commands/publish`
- `POST /api/v1/branding-versions/{id}/commands/retire`
- `POST /api/v1/branding-versions/{id}/commands/clone`

## Portfolio command

Portfolio audit evaluation is exposed as:

`POST /api/v1/portfolio-audits/{id}/commands/evaluate`

The request supplies an expected record version, an optional as-at date and property projections. The command writes findings, audit metadata, audit history and an outbox event.

## External activation boundary

The following remain deployment or provider concerns:

- PMS OAuth credentials and live webhooks
- cloud archive/ZIP generation
- signed delivery links
- production Firestore indexes and retention policies
- billing-provider integration
- production scheduling and field mobile interfaces
