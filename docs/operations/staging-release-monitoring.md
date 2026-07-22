# Staging, monitoring, and controlled releases

## Environment boundary

Provision staging from `infrastructure/terraform/environments/staging`. It creates a separate Firebase project, Identity Platform configuration, Firestore database, storage buckets, API/AI/PDF Cloud Run services, hosting site, service accounts, and regional logging. Register the staging web app with App Check and observe App Check metrics before enforcement. Development/CI may use Firebase's debug token; production tokens and tenant records must never be copied to staging.

Seed only synthetic records with:

```sh
APP_ENV=staging GOOGLE_CLOUD_PROJECT=<staging-project-id> npm run seed:staging
```

The script refuses projects whose identifier does not contain `staging`.

## Release gate

Pull requests must pass formatting, lint, type checks, unit/rules/emulator tests, application builds, artifact verification, and browser/accessibility tests. The delivery pipeline promotes the same immutable image digest through development, staging, and production; the production target requires approval. Health checks must pass before promotion. Rollback selects the previous healthy Cloud Run revision/image digest, then reruns production health checks.

Protect `main` in repository settings and require the CI and browser jobs plus an approving review. GitHub environment protection must require approval for `production`.

## Staging smoke suite

Run authentication, agency claims/roles, custom API authentication, App Check, property/report persistence, photo upload/retrieval, AI, PDF, expired session, API/upload failure, conflict, offline replay, and large-report scenarios. Record the tested artifact SHA/digest with results.

## Monitoring

The API emits one structured request record with severity, correlation ID, agency, actor (when resolved by the response), operation, entity, duration, status, and error code. Client notifications expose correlation IDs as support references.

Maintain dashboards and alerts for API 5xx rate/latency, authentication failures, Cloud Run instance and memory failures, offline queue backlog, upload failures, AI/PDF failure rate and latency, Firestore permission denials, storage quota, and `/health` uptime. Route browser telemetry only through an authenticated endpoint; never send report or photo content in telemetry. Alert runbooks must identify owner, threshold, investigation query, mitigation, rollback, and escalation path.
