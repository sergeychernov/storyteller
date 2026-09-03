# Deploying to Railway

Railway can import this Yarn workspace as a shared JavaScript monorepo. The deployable workspaces expose `build` and `start` scripts, and the API listens on Railway's injected `PORT`.

## Services

Create one Railway project from the GitHub repository and keep these detected services:

| Service | Workspace | Public domain | Notes |
| --- | --- | --- | --- |
| `web` | `@storyteller/site` host | yes | One origin serving Site, Story Studio, and Clip Studio build artifacts |
| `admin` | `@storyteller/admin` | yes | Independent read-only static service at `admin.makeitastory.app`; no database or backend secrets |
| `api` | `@storyteller/api` | yes | Fastify API; attach PostgreSQL; healthcheck is `/health` |
| `worker` | `@storyteller/worker` | no | FFmpeg scene renderer and object cleanup |
| `mcp` | `@storyteller/mcp` | only when external MCP clients need it | Placeholder process; it does not expose HTTP yet |

Do not deploy `@storyteller/mobile` to Railway. It is an Expo native application and should be built with EAS or the native store toolchain.

The worker is required for scene downloads. The MCP process is still a placeholder and may be omitted to avoid idle compute cost.

## Import and commands

1. In Railway, choose **New Project → Deploy from GitHub repo** and select this repository.
2. Accept Railway's JavaScript monorepo detection for `web`, `admin`, `api`, `worker`, and `mcp`.
3. Keep the repository root as the build root. These are shared workspaces, so setting a service root to `/apps/...` would hide shared packages and the root lockfile.
4. If Railway does not fill commands automatically, set them as follows:

| Service | Build command | Pre-deploy command | Start command |
| --- | --- | --- | --- |
| `web` | `yarn build:web` | — | `yarn workspace @storyteller/site start` |
| `admin` | `yarn build:admin` | — | `yarn workspace @storyteller/admin start` |
| `api` | `yarn workspace @storyteller/api build` | `yarn db:migrate` | `yarn workspace @storyteller/api start` |
| `worker` | `yarn build:backend` | `yarn db:migrate` | `yarn workspace @storyteller/worker start` |
| `mcp` | `yarn workspace @storyteller/mcp build` | — | `yarn workspace @storyteller/mcp start` |

The worker build includes the API TypeScript project so its image contains the same compiled migration entry point. It does not start an API or build either frontend. The migration command uses `node`, not the development-only `tsx` runner.

Railway should install dependencies with `yarn install --immutable`; the repository pins Yarn 4 through `packageManager`.
The root `railpack.json` adds FFmpeg to the runtime image. The API uses `ffprobe` to inspect uploads and `ffmpeg` to separate video/audio and denoise/normalize audio before adding the material to a scene. Allow temporary disk space and request time for this processing, in addition to the uploaded file size.

## Domains and variables

Generate public domains for `api` and `web`, and attach the first-party custom
domain `api.makeitastory.app` to the API before releasing cookie-only browser
authentication. Then add these variables to the `web` service:

```dotenv
VITE_API_URL=https://api.makeitastory.app
VITE_ADMIN_URL=https://admin.makeitastory.app
VITE_AMPLITUDE_API_KEY=<browser project API key>
VITE_AMPLITUDE_SERVER_ZONE=US
```

These `VITE_` variables are compiled into the public browser bundles, so changing one requires a new frontend deployment. The Amplitude server zone must match the organization's US or EU data region; omit the API key to disable analytics. No `PORT` variable needs to be created: Railway injects it for public services. See the [event and privacy contract](product-analytics.md) before enabling it.

The independent Admin service receives only public origins:

```dotenv
VITE_API_URL=https://api.makeitastory.app
VITE_SITE_URL=https://makeitastory.app
ADMIN_API_ORIGIN=https://api.makeitastory.app
```

Do not attach PostgreSQL, storage, `PLATFORM_CREDENTIALS_KEY`, `CSRF_HMAC_KEY`,
Amplitude, or another backend secret to Admin. Set its healthcheck to `/health`.

Add the same project key and region to the `api` service. The Browser SDK sends
to this service's first-party relay, which validates the typed event taxonomy
before forwarding to the fixed regional Amplitude ingestion endpoint:

```dotenv
AMPLITUDE_API_KEY=<same browser project API key>
AMPLITUDE_SERVER_ZONE=US
```

The public English homepage lives at `/`; Russian and Serbian use `/ru` and `/sr`. Scenario and feature pages follow the same localized URL structure. Site owns `/sign-in` and `/app`; Story Studio uses `/app/stories/*`, and Clip Studio uses `/app/clips/*`. The frontend build generates route-specific public HTML, canonical and hreflang links, structured metadata, `robots.txt`, and `sitemap.xml` for `https://makeitastory.app`. Both application prefixes remain `noindex`, and legacy `/stories/*` links redirect to `/app/stories/*` with IDs and query strings intact. Point the Railway custom domain at the `web` service before submitting that sitemap to search engines. Keep the API on `api.makeitastory.app`: a Railway `*.up.railway.app` API origin is cross-site relative to Site/Admin and therefore cannot carry the required `SameSite=Strict` browser cookie.

The public homepage and features page include a roadmap widget. The browser reads
`/product-roadmap.json`; the Site server calculates that response from GitHub
milestone `open_issues`, `closed_issues`, and `due_on` through
[`public-roadmap.mjs`](../scripts/public-roadmap.mjs). Results are cached in memory
for five minutes and the previous successful aggregate remains available if a
later GitHub request fails. The response contains no issue titles, bodies, labels
or users. The public repository works without credentials; an optional
server-only `PRODUCT_ROADMAP_GITHUB_TOKEN` increases the GitHub API limit and
must never use a `VITE_` prefix.

Issue status and milestone date changes appear after the runtime cache expires and
do not require a site deployment. Changes to the localized public titles in
`docs/product-roadmap.md`, the aggregator or the UI still require deployment.
The frontend host serves HTML with `no-cache`; an already-open page refetches when
the roadmap query becomes stale or the window regains focus. Editing this guide
does not change existing Railway service settings.

Attach a Railway PostgreSQL service to both the API and worker so both receive the same `DATABASE_URL`. Configure `PLATFORM_CREDENTIALS_KEY` on the API with the output of `openssl rand -base64 32`. Configure browser auth only on the API:

```dotenv
BROWSER_ORIGINS=https://makeitastory.app,https://admin.makeitastory.app
CSRF_HMAC_KEY=<independent long random secret>
SESSION_COOKIE_SECURE=true
```

`BROWSER_ORIGINS` is an exact allowlist with credentials; wildcard and runtime
fallbacks are rejected in production. The browser cookie is host-only on the API,
so use a stable first-party API domain before production acceptance. Migrations
run before either backend service starts; they require only database access, not
API or storage credentials. The API retains its idempotent startup migration for
local development and as a fallback.

Create a private Railway Storage Bucket in the same region as the API and worker. Reference the same credentials from both services using these variables:

```dotenv
MEDIA_STORAGE_DRIVER=s3
S3_BUCKET=${{media.BUCKET}}
S3_ENDPOINT=${{media.ENDPOINT}}
S3_REGION=${{media.REGION}}
S3_ACCESS_KEY_ID=${{media.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{media.SECRET_ACCESS_KEY}}
S3_FORCE_PATH_STYLE=false
S3_DOWNLOAD_URL_TTL_SECONDS=3600
```

Replace `media` with the bucket service name on the Railway canvas. Keep the bucket private. The API stores validated originals plus separate video and processed audio working tracks. The worker downloads the tracks needed for the selected export, renders MP4 or audio-only M4A with FFmpeg, uploads the result, and records its stable object key in PostgreSQL. Authorized reads may use short-lived presigned URLs. `MEDIA_TEMP_ROOT` may point to ephemeral disk when a custom upload directory is needed; completed originals, tracks and exports never depend on that disk. Coordinate backend and web versions using the release order below.

The default `MEDIA_STORAGE_DRIVER=local` remains available for local development. A persistent Volume is no longer required for production media storage.

Changing the driver does not copy files that already exist on a local filesystem. Before the first S3 deployment, copy any originals that still need to be preserved into the bucket under their existing `storageKey` paths. Database records whose ephemeral files have already disappeared cannot be recovered by this change and should be removed or uploaded again.

Configure the API healthcheck path as `/health` with a 60-second timeout.

## Database migrations in CI/CD

[GitHub Actions](../.github/workflows/ci.yml) starts a disposable PostgreSQL 17 service on every pull request and push to `main`. In addition to the product tests, it:

- Tests fresh installation, concurrent/repeated migrations, upgrade from schema 3 with existing rows, old API/worker writes after migration 4, and transactional rollback on failure.
- Runs the production `yarn db:migrate` command twice without an API credential key.
- Checks `/health` for both the development entry point and the compiled API against the migrated database.

`yarn test` rebuilds TypeScript test outputs even after a Vite build has replaced `apps/story-web/dist`; stale incremental build metadata must not silently omit frontend tests.

PostgreSQL tests use only the explicitly supplied `STORYTELLER_TEST_DATABASE_URL` and create/drop isolated schemas. Never point this variable at production. GitHub does not receive production database credentials and does not run migrations against production.

In Railway, set the pre-deploy command in the table above for **both** `api` and `worker`. A [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command) runs after the image is built, with the service's private database access. A nonzero exit stops that service's deployment. `schema_migrations` and a PostgreSQL advisory lock serialize concurrent runners; each migration and its version record commit in one transaction. The runner limits connection/lock waits to 10 seconds and each SQL statement to 60 seconds. A timeout fails the deployment instead of bypassing the migration; resolve the cause and retry.

Enable **Settings → Source → Wait for CI** for `api`, `worker`, `web`, and `admin` so [GitHub checks gate autodeploys](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci). This switch is a Railway setting, not something the workflow can enable. Watch paths and pre-deploy hooks also need to be set on the actual services; changing this guide alone does not apply them. Publish the commit containing `db:migrate`, `build:backend`, and `build:admin` before deploying with these commands. Do not redeploy an older image with the new commands.

Pre-release audit, 2026-08-28: production API/worker pre-deploy commands, worker backend build, API healthcheck, and the pre-B16 API/worker/web watch paths were saved and read back from Railway. B16 update, 2026-08-29: the Web service was changed to build with `yarn build:web`, start with `yarn workspace @storyteller/site start`, and use the frontend watch paths in this guide; all three fields and active `source.checkSuites: true` were read back from production configuration. The settings apply on the next deployment; this read-back does not claim that uncommitted B16 code is deployed.

Production correction, 2026-09-02: the Web service received the repository-wide
`/**` watch path while **Wait for CI** remained enabled. Applying the setting
deployed commit `f99ac7d` as deployment
`7294a16a-3106-4176-8a53-d50bd43b250c`; the production Preview then exposed the
master-export panel and returned the expected approved-mix prerequisite error.

### B14 release order

B14 is intentionally a staged release: apply additive migration 10 first; release
the API with cookie/CSRF/Admin endpoints; release the Worker with 90-day cleanup;
then release Site, Story Studio, and Clip Studio with bearer-to-cookie migration.
Only after those checks pass should the independent Admin service be created and
deployed. Connect `admin.makeitastory.app`, DNS and TLS last. Keep legacy bearer
endpoints for Mobile/MCP. Do not mark B14 `done (P0)` until the production
acceptance matrix below passes; documentation and local builds are not deployment.

The first B14 rollout completed on 31.08.2026. The base release `66426a9`, the
relation-read fix `0596a15`, and the localization fix `5f838ff` passed CI and
were deployed; API, Worker, Web, and Admin reached `SUCCESS`. Production
acceptance confirmed the shared Site/Admin cookie session, `401`/`403`,
logout/revocation, the complete missing/invalid/valid CSRF matrix, exact CORS
allow/deny, CSP/frame denial/noindex/robots, read-only data and audit, localized
empty states, and responsive layouts at 390/320 px. Admin has no database
credentials. A repeated public read-only check on 31.08.2026 returned `200` from
the API and Admin healthchecks and the Admin root, with CSP, `DENY`, nosniff,
permissions/referrer policies, `X-Robots-Tag: noindex, nofollow`, and a fully
closed `robots.txt`. B14 Web is therefore `done (P0)`; B15 mutations and F17
billing/usage remain out of scope.

For an ordered rollout, publish a feature branch and verify its exact commit in GitHub CI while keeping the watched `main` branch unchanged. Deploy that explicit commit SHA to worker, API, and Web separately as described below; do not use a redeploy operation that reuses an older image. Once all services run compatible F05.1 code, merge the verified change into `main` and apply the pending Check Suites settings. Applying environment changes can redeploy multiple services, so the source branch must already contain the compatible release. Confirm `source.checkSuites: true` on each service. Alternatively, temporarily disable autodeploy before merging and restore its previous state after the ordered rollout; verify that the setting actually changed before relying on it. Never bypass a failed CI check or mix an old image with commands that exist only in the new commit.

### Migration 4 and the first F05.1 release

Migration 4 is an additive, nullable `scene_renders.content_hash` column with a SHA-256 format check. Existing values remain `NULL`, existing story JSON is untouched, and SQL from the previous API/worker still works. Rolling application code back does not require dropping the column or undoing this migration. The `ALTER TABLE` still takes a database lock; do not assume zero lock time.

Database compatibility does not imply compatibility of every mixed application version. For the first F05.1 release, let the new worker's pre-deploy step apply the migration, update **all worker replicas**, and wait for old workers to stop before releasing the API, then Web. An old worker cannot produce the result hash expected by the new API. Pre-deploy hooks are per service: they do not enforce this cross-service order. Use a staged rollout (or disable autodeploy temporarily) for this transition; do not push all three services into an uncontrolled simultaneous rollout.

### Verified first rollout, 2026-08-28

Commit `dc4871a62aee305f0ee7e64de7e59f067270e79d` passed [GitHub CI #33204145109](https://github.com/sergeychernov/storyteller/actions/runs/33204145109) and was deployed to production by explicit SHA while `main` remained unchanged. Autodeploy was left enabled. Each previous deployment was verified as `REMOVED` before proceeding to the next service:

| Order | Service | Verified deployment | Status |
| --- | --- | --- | --- |
| 1 | `worker` | `5d0b314a-13dd-42b0-a7b3-b7ae76605da9` | `SUCCESS`; pre-deploy migration succeeded |
| 2 | `api` | `45248c4c-7e30-43e3-af0c-18a1b3a45e76` | `SUCCESS`; repeated pre-deploy migration succeeded |
| 3 | `web` | `3e190d79-ab19-4d5a-9a7b-57ac462cace5` | `SUCCESS` |

The API returned HTTP 200 for `/health` and `/docs/json`; its OpenAPI schema includes render history and the content hash/dependency/current fields. The public Web page and bundle returned HTTP 200. The deployed bundle includes the EN/RU/SR version-history UI and the generated product roadmap revision `ba0f99e02e17` (P0: 11 of 37 task/interface pairs complete, 29%). These were read-only production checks; rendering was exercised locally, and no YouTube publication was made.

The subsequent merge and Wait for CI activation are tracked in [PR #2](https://github.com/sergeychernov/storyteller/pull/2). Verify active `source.checkSuites` values after applying the environment changes; the successful application rollout alone does not prove CI gating is enabled.

## Watch paths

Railway's automatic monorepo import may initially watch only the application directory. Add these root-relative patterns so shared-package and lockfile changes also redeploy affected services.

### `web`

Keep the production Web service on a repository-wide trigger while **Wait for
CI** is enabled. Railway evaluates watch paths against each individual commit,
not against the cumulative diff from the active deployment. With narrow paths,
a Web commit rejected by CI can remain undeployed after a later backend-only
commit passes CI, leaving the API and browser bundle on different revisions.

```text
/**
```

### `admin`

```text
/apps/admin/**
/packages/api-client/**
/packages/auth-client/**
/packages/domain/**
/packages/localization/**
/packages/schemas/**
/package.json
/yarn.lock
/.yarnrc.yml
/tsconfig.base.json
/tsconfig.json
/railpack.json
```

### `api`

```text
/apps/api/**
/packages/analytics/**
/packages/application/**
/packages/domain/**
/packages/schemas/**
/packages/renderer/**
/packages/render-queue/**
/packages/storage/**
/package.json
/yarn.lock
/.yarnrc.yml
/tsconfig.base.json
/tsconfig.json
/railpack.json
```

### `worker`

```text
/apps/worker/**
/apps/api/**
/packages/application/**
/packages/domain/**
/packages/schemas/**
/packages/renderer/**
/packages/render-queue/**
/packages/storage/**
/package.json
/yarn.lock
/.yarnrc.yml
/tsconfig.base.json
/tsconfig.json
/railpack.json
```

### `mcp`

Use `/apps/mcp/**` plus the root configuration and lockfile paths shown above. Add shared package paths when the service begins importing application or publisher code.

## Verification

After deployment:

```bash
curl --fail "https://<api-domain>/health"
curl --fail "https://<web-domain>/"
curl --fail "https://<web-domain>/app/stories"
curl --fail "https://<web-domain>/app/clips"
curl --fail "https://admin.makeitastory.app/health"
curl --fail --head "https://admin.makeitastory.app/"
```

Open the web root without signing in and verify that the roadmap position and counts match the deployed document. Confirm that `/stories/<id>` redirects without losing the ID, direct reloads under both `/app/*` prefixes return their own application shell, and sign-in returns only to an allowlisted same-origin application path. As a deployment smoke test, update one task's status while retaining its milestone, deploy again, and verify the new count after a page reload. Run `yarn test:roadmap`, `yarn test:site`, and `yarn build:web` before deployment.

For B14, also verify TLS, CSP/frame denial/noindex/closed `robots.txt`, sign-in via
the main Site with fixed `continue=admin`, shared cookie restore and logout,
distinct `401` and `403`, one allowed and one forbidden CORS origin, missing and
invalid CSRF, read-only data on desktop and 390/320 px, and absence of database
credentials in the Admin service. Run `yarn test:admin` and `yarn build:admin`.

For issue #16, deploy the additive database migration first, then API, then Admin;
the previous read-only Admin remains compatible during the sequence. Run
`yarn check`, `yarn test`, `yarn test:api:postgres`, `yarn test:admin`, and
`yarn build:admin`. On a dedicated test profile, preview and reverse one role,
cohort membership, capability override and limit override; verify bulk refuses a
missing or stale target without partial changes, session revoke never exposes a
token/hash, and every committed change has the real actor, reason, target and batch
in immutable audit. Also verify self-demotion, last-manager removal, current-session
revoke, missing/invalid CSRF, ordinary-user access and an expired preview are all
rejected. Do not close issue #16 until these production checks are recorded there.

Registration, sessions, stories, and encrypted platform credentials persist in PostgreSQL and can be shared safely by multiple API replicas.
