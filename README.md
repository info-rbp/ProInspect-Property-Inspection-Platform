# Remote Business Partner Property Condition Reporter

A property inspection platform for Entry Property Condition Reports, Routine Inspections, Exit Inspections, Comparison Reports, and Maintenance and Follow-Up reports.

## Current status

The technical implementation plan has been implemented through the repository-local application, domain, API, worker, security and operational layers. External provider activation and production acceptance remain gated by real cloud projects, credentials, policy decisions and staging evidence. See the [implementation status](docs/implementation-status.md) for the exact boundary.

## Authoritative product documentation

- [Inspection type requirements](docs/product/inspection-types.md)
- [End-to-end inspection business workflow](docs/product/business-workflow.md)
- [Release scope and product priorities](docs/product/release-scope.md)
- [Role and capability matrix](docs/product/role-capability-matrix.md)
- [Phase 1 completion record](docs/product/phase-1-completion.md)

## Repository structure

```text
/apps
  /web
  /api
  /ai-worker
  /media-worker
  /pdf-worker
  /outbox-worker
/packages
  /domain
  /validation
  /ui
  /templates
  /quality
  /integrations
  /testing
  /config
/infrastructure
  /terraform
  /firebase
  /cloud-deploy
```

The web application contains the inspection, review, queue and service-operations workspaces. The Cloud Run API owns material writes and lifecycle commands. Durable media, AI, PDF and outbox workers perform asynchronous work. Shared packages define reports, quality, templates, integrations, workflow and service-operation contracts.

## Local development

Prerequisites:

- Node.js 22
- npm 10 or later
- Java 21 for Firebase emulators

Install dependencies and start the complete local environment:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run dev:local
```

This starts:

- Firebase Auth, Firestore, Storage, Hosting, and Emulator UI
- API on port 8080
- Web application on port 3000

Detailed instructions are in [Local Development](docs/development/local-development.md).

## Environment configuration (Firebase and AI Commentary keys)

The web application's Settings page reports "Needs attention" for
**Firebase** and **AI Commentary** until their keys are supplied. Both are
build-time Vite environment variables consumed by `apps/web` — see
[Environment configuration](docs/development/environment-configuration.md)
for exactly which keys each card needs, where to obtain them, and how to
inject them for local development, CI, and Cloudflare Pages/GitHub Actions
deployments.

Quick start:

```bash
cp apps/web/.env.example apps/web/.env.local
# edit apps/web/.env.local with real values, then:
npm run build:packages && npm run build --workspace @pcr/web
```

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:emulator
npm run test:e2e
```

The standard pull-request gate is:

```bash
npm run check
```

## Engineering standards

The repository now includes:

- npm workspaces
- strict TypeScript configuration
- shared domain and validation packages
- consistent API error contracts and correlation IDs
- structured JSON logging foundations
- automated formatting checks
- Dependabot configuration
- CODEOWNERS and a pull-request template
- unit, API, rules, emulator, and Playwright test foundations
- CI validation for the workspace and browser smoke tests

## Firebase and Google Cloud

Firebase configuration now lives under `infrastructure/firebase`.

The approved target architecture uses:

- Firebase Hosting
- Identity Platform
- Cloud Run
- Firestore
- Cloud Storage
- Cloud Tasks
- Pub/Sub
- Vertex AI
- Secret Manager
- Cloud Logging and Cloud Monitoring
- Artifact Registry, Cloud Build, and Cloud Deploy

Terraform and Cloud Deploy directories are established as controlled infrastructure boundaries. Their environment implementation is tracked in issue #3.

## Activation boundary

No source checkout is production-ready by itself. Direct PMS integration, public delivery, email/SMS, custom domains, workload identities and legal/retention policies require approved external configuration. Those paths fail closed until configured; no provider, credential or business authority is simulated. Production promotion remains subject to the gates in [release scope](docs/product/release-scope.md).
