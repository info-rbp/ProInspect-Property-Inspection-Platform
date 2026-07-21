# Deferred production actions

The following changes require live services, credentials, environment approvals or broader product decisions and are intentionally not represented as complete repository work.

## Server-side AI activation

- Route browser analysis requests through the authenticated API and durable analysis-job contract.
- Store Gemini credentials in Secret Manager and remove operator-supplied browser keys from production.
- Deploy and exercise the AI worker against representative PCR evidence.
- Record model, prompt, evidence generation, retry and cost telemetry.

## Template administration

- Connect the existing versioned template package to the administrative Templates interface.
- Implement draft, publish, retire, import and report-binding workflows.
- Validate imported commentary-bank records against representative property reports.

## Authoritative workflow wiring

- Route every generic report and inspection transition through the domain workflow engine using server-derived gate context.
- Complete API integration tests for evidence, reviewer, tenant-response, PDF and archive gates.

## Environment activation

- Supply separate development, staging and production Firebase configuration through protected environment settings.
- Configure App Check, Identity Platform tenants, Cloud Tasks, storage events and monitoring.
- Run field, offline, notification, migration, performance, rollback and archive-recovery exercises.

## Dependency reproducibility

- Generate and commit a lockfile from an approved networked development environment.
- Change CI installation from `npm install` to `npm ci` after the lockfile is reviewed.

The fixed administrator login remains by explicit product-owner decision and is therefore not included in this remediation list.
