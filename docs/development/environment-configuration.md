# Environment configuration

The Settings page (`apps/web/pages/admin/SettingsPage.tsx`) shows a status
card for each platform capability. Two of them read directly from Vite
build-time environment variables and will show **"Needs attention"** until
those variables are supplied at build time.

| Card | Source | Env vars |
| --- | --- | --- |
| **Firebase** | `isFirebaseConfigured()` in `apps/web/services/firebaseClient.ts` | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` |
| **AI Commentary** | `Boolean(import.meta.env.VITE_API_BASE_URL?.trim())` in `SettingsPage.tsx` | `VITE_API_BASE_URL` |

## Why these can't be hardcoded as source literals

Vite inlines `import.meta.env.VITE_*` values into the JavaScript bundle
**at build time** (`vite build`), not at runtime in the browser. There is
no server-side config endpoint for these two — the value that was present
in the shell when `npm run build --workspace @pcr/web` ran is the value
shipped to every visitor of that build. That means:

- They must be set as real environment variables (or an `.env.local` file)
  **before** running the build, not edited into a config object shipped in
  the repo.
- Changing them requires a rebuild + redeploy; there is no "save" button in
  the app that can change them after the fact for a given deployed bundle.

## Where the files live

Vite resolves `.env*` files relative to its own project root, which for
this monorepo is **`apps/web`** (where `vite.config.ts` lives), **not** the
repository root. A `.env.local` at the repo root is silently ignored by the
web build.

```
apps/web/.env.example   # committed template — lists every VITE_ key read by the app
apps/web/.env.local     # your real values — git-ignored via the root .gitignore `*.local` rule
```

Set up local values:

```bash
cp apps/web/.env.example apps/web/.env.local
# edit apps/web/.env.local
npm run build:packages && npm run build --workspace @pcr/web
```

`npm run dev:web` / `npm run dev:local` also read `apps/web/.env.local`
automatically (same Vite env resolution applies in dev mode).

## AI Commentary: `VITE_API_BASE_URL`

Set this to the base URL of the deployed Cloud Run API
(`apps/api`) that proxies the Vertex AI commentary workflow, e.g.:

```
VITE_API_BASE_URL=https://api-xxxxxxxxxx-uc.a.run.app
```

If unset, `apiClient.ts` fails closed with `VITE_API_BASE_URL is required
for cloud operations.` rather than silently calling an undefined endpoint —
this is intentional; there is no default/placeholder API to fall back to.

See [Cloud Run API](../backend/cloud-run-api.md) and
[Google Cloud activation](../backend/google-cloud-activation.md) for
provisioning the API service itself.

## Firebase: the six `VITE_FIREBASE_*` keys

Get these from **Firebase Console → Project settings → General → Your apps
→ SDK setup and configuration**. All six must be present together or none
are used (`hasCompleteFirebaseConfig()` in `services/configService.ts`
requires all of them).

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=1:...:web:...
```

Optional, for Firebase App Check on outgoing API calls:

```
VITE_FIREBASE_APP_CHECK_SITE_KEY=...
```

### Important caveat — the mock-login accounts always show "Needs attention" for Firebase

`AuthContext.tsx` ships hardcoded mock accounts
(`info@proinspect.systems`, `info@remotebusinesspartner.com.au`) that
bypass Firebase Authentication entirely and set
`localStorage['pcr_proinspect_logged_in'] = 'true'`. Look at
`isFirebaseConfigured()`:

```ts
export const isFirebaseConfigured = (): boolean => {
  if (typeof window !== 'undefined' && window.localStorage.getItem('pcr_proinspect_logged_in') === 'true') return false;
  return isFirebaseConfigResolved();
};
```

Whenever the current session is one of those mock logins, this function
**always returns `false`**, regardless of whether real `VITE_FIREBASE_*`
keys were supplied at build time. So:

- Signing in with either hardcoded mock account will always show the
  Firebase card as "Needs attention" on Settings, even after you set the
  keys and rebuild.
- To see the Firebase card go "Ready", sign in with a **real** Firebase
  Auth user (registered against the project identified by
  `VITE_FIREBASE_PROJECT_ID`) instead of a mock account, after setting all
  six `VITE_FIREBASE_*` keys and rebuilding.

This is a deliberate product behavior (mock sessions are explicitly
local/offline-only and never touch Firestore), not a bug — but it means
"set the keys" alone will not flip that card for anyone testing through
the mock accounts.

## Injecting keys per environment

### Local development

`apps/web/.env.local` (see above). Never commit this file.

### CI (`.github/workflows/ci.yml`)

CI currently runs `npm run build:apps`, which builds `apps/web` with
whatever `VITE_*` variables are present in the job environment (none by
default — CI intentionally exercises the "keys not configured" fail-closed
paths). To build CI against real staging/dev values, add the variables as
[GitHub Actions repository or environment secrets](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions)
and export them before the build step, e.g.:

```yaml
- name: Build applications
  env:
    VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
    VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
    VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
    VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
    VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
    VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
    VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
  run: npm run build:apps
```

Add each secret under **Settings → Secrets and variables → Actions** in
the GitHub repository.

### Cloudflare Pages

`wrangler.jsonc` at the repo root points `pages_build_output_dir` at
`apps/web/dist`. Cloudflare Pages builds do **not** automatically read
`apps/web/.env.local` (it's git-ignored, so it never reaches the build
machine). Set the same `VITE_*` keys as **Cloudflare Pages project
environment variables** (Pages dashboard → your project → Settings →
Environment variables, or `wrangler pages secret put <NAME>` /
`wrangler pages deployment` env config for the Pages build), then run the
build command:

```
npm run build:packages && npm run build --workspace @pcr/web
```

with those variables present in the Pages build environment. Wrangler
picks up `process.env.VITE_*` at build time the same way any other CI
runner does — Vite itself doesn't know or care that the host is
Cloudflare.

### Any other deploy target

The rule is always the same: **the `VITE_*` variables must be present in
the shell that invokes `vite build`** (directly, via a CI secret, or via
your hosting provider's build-environment-variables feature). There is no
runtime config file read by the deployed static bundle for these two keys.
