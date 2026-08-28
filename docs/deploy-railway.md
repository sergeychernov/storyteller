# Deploying to Railway

Railway can import this Yarn workspace as a shared JavaScript monorepo. The deployable workspaces expose `build` and `start` scripts, and the API listens on Railway's injected `PORT`.

## Services

Create one Railway project from the GitHub repository and keep these detected services:

| Service | Workspace | Public domain | Notes |
| --- | --- | --- | --- |
| `web` | `@storyteller/web` | yes | Public homepage and React/Vite studio |
| `api` | `@storyteller/api` | yes | Fastify API; attach PostgreSQL; healthcheck is `/health` |
| `worker` | `@storyteller/worker` | no | FFmpeg scene renderer and object cleanup |
| `mcp` | `@storyteller/mcp` | only when external MCP clients need it | Placeholder process; it does not expose HTTP yet |

Do not deploy `@storyteller/mobile` to Railway. It is an Expo native application and should be built with EAS or the native store toolchain.

The worker is required for scene downloads. The MCP process is still a placeholder and may be omitted to avoid idle compute cost.

## Import and commands

1. In Railway, choose **New Project → Deploy from GitHub repo** and select this repository.
2. Accept Railway's JavaScript monorepo detection for `web`, `api`, `worker`, and `mcp`.
3. Keep the repository root as the build root. These are shared workspaces, so setting a service root to `/apps/...` would hide shared packages and the root lockfile.
4. If Railway does not fill commands automatically, set them as follows:

| Service | Build command | Pre-deploy command | Start command |
| --- | --- | --- | --- |
| `web` | `yarn workspace @storyteller/web build` | — | `yarn workspace @storyteller/web start` |
| `api` | `yarn workspace @storyteller/api build` | `yarn db:migrate` | `yarn workspace @storyteller/api start` |
| `worker` | `yarn build:backend` | `yarn db:migrate` | `yarn workspace @storyteller/worker start` |
| `mcp` | `yarn workspace @storyteller/mcp build` | — | `yarn workspace @storyteller/mcp start` |

The worker build includes the API TypeScript project so its image contains the same compiled migration entry point. It does not start an API or build either frontend. The migration command uses `node`, not the development-only `tsx` runner.

Railway should install dependencies with `yarn install --immutable`; the repository pins Yarn 4 through `packageManager`.
The root `railpack.json` adds FFmpeg to the runtime image. The API uses `ffprobe` to inspect uploads and `ffmpeg` to separate video/audio and denoise/normalize audio before adding the material to a scene. Allow temporary disk space and request time for this processing, in addition to the uploaded file size.

## Domains and variables

Generate public domains for `api` and `web`. Then add this variable to the `web` service:

```dotenv
VITE_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}
```

`VITE_API_URL` is compiled into the browser bundle, so changing it triggers a new web deployment. No `PORT` variable needs to be created: Railway injects it for public services.

The public English homepage lives at `/`; Russian and Serbian use `/ru` and `/sr`. Scenario and feature pages follow the same localized URL structure. The web build generates route-specific HTML, canonical and hreflang links, structured metadata, `robots.txt`, and `sitemap.xml` for `https://makeitastory.app`. Studio routes remain `noindex`. Point the Railway custom domain at the `web` service before submitting that sitemap to search engines.

The public homepage and features page include a roadmap widget. Every web build reads `docs/product-roadmap.md` through the [Vite plugin](../scripts/vite-public-roadmap.mjs) and embeds a validated public summary in the content-hashed bundle. There is no manually maintained JSON snapshot or runtime API dependency. Invalid milestone definitions/statuses fail the build. Completed task cells retain their original milestone as `done (Pn)` / the generated badge tooltip.

This refreshes the widget on **site deployment**, not on YouTube story publication. The existing static server serves `index.html` with `no-cache`; new page loads receive the new hashed bundle. An already-open production page needs a reload. Update the web service's watch paths below so a document-only commit triggers deployment as well; editing this guide does not change existing Railway service settings.

Attach a Railway PostgreSQL service to both the API and worker so both receive the same `DATABASE_URL`. Configure `PLATFORM_CREDENTIALS_KEY` on the API with the output of `openssl rand -base64 32`, and set `WEB_ORIGIN` to the public web URL (multiple origins may be comma-separated). Migrations run before either backend service starts; they require only database access, not API or storage credentials. The API retains its idempotent startup migration for local development and as a fallback.

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

`yarn test` rebuilds TypeScript test outputs even after a Vite build has replaced the web `dist` directory; stale incremental build metadata must not silently omit frontend tests.

PostgreSQL tests use only the explicitly supplied `STORYTELLER_TEST_DATABASE_URL` and create/drop isolated schemas. Never point this variable at production. GitHub does not receive production database credentials and does not run migrations against production.

In Railway, set the pre-deploy command in the table above for **both** `api` and `worker`. A [pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command) runs after the image is built, with the service's private database access. A nonzero exit stops that service's deployment. `schema_migrations` and a PostgreSQL advisory lock serialize concurrent runners; each migration and its version record commit in one transaction. The runner limits connection/lock waits to 10 seconds and each SQL statement to 60 seconds. A timeout fails the deployment instead of bypassing the migration; resolve the cause and retry.

Enable **Settings → Source → Wait for CI** for `api`, `worker`, and `web` so [GitHub checks gate autodeploys](https://docs.railway.com/deployments/github-autodeploys#wait-for-ci). This switch is a Railway setting, not something the workflow can enable. Watch paths and pre-deploy hooks also need to be set on the actual services; changing this guide alone does not apply them. Publish the commit containing `db:migrate` and `build:backend` before deploying with these commands. Do not redeploy an older image with the new commands.

Pre-release audit, 2026-08-28: production API/worker pre-deploy commands, worker backend build, API healthcheck, and API/worker/web watch paths were saved and read back from Railway. Web watches include the product roadmap and its generators. Railway's pending-change view confirmed the plugin's `Check Suites: false → true` updates; a pending setting is not yet an active setting. Read `source.checkSuites` back after applying it before relying on automatic CI gating. An embedded browser is not required to configure Railway.

For an ordered rollout, temporarily disable autodeploy on the three services without stopping their running deployments. Publish and verify the exact commit in GitHub CI, then deploy that commit to worker, API, and Web separately as described below. Apply the pending Check Suites changes only once all services run compatible F05.1 code: applying environment changes can redeploy multiple services. Confirm `source.checkSuites: true` and restore each service's previous autodeploy state. Never bypass a failed CI check or mix an old image with commands that exist only in the new commit.

### Migration 4 and the first F05.1 release

Migration 4 is an additive, nullable `scene_renders.content_hash` column with a SHA-256 format check. Existing values remain `NULL`, existing story JSON is untouched, and SQL from the previous API/worker still works. Rolling application code back does not require dropping the column or undoing this migration. The `ALTER TABLE` still takes a database lock; do not assume zero lock time.

Database compatibility does not imply compatibility of every mixed application version. For the first F05.1 release, let the new worker's pre-deploy step apply the migration, update **all worker replicas**, and wait for old workers to stop before releasing the API, then Web. An old worker cannot produce the result hash expected by the new API. Pre-deploy hooks are per service: they do not enforce this cross-service order. Use a staged rollout (or disable autodeploy temporarily) for this transition; do not push all three services into an uncontrolled simultaneous rollout.

## Watch paths

Railway's automatic monorepo import may initially watch only the application directory. Add these root-relative patterns so shared-package and lockfile changes also redeploy affected services.

### `web`

```text
/apps/web/**
/packages/domain/**
/packages/localization/**
/docs/product-roadmap.md
/scripts/public-roadmap.mjs
/scripts/public-site.mjs
/scripts/prerender-public-site.mjs
/scripts/sync-product-roadmap.mjs
/scripts/vite-public-roadmap.mjs
/scripts/vite-public-site.mjs
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
```

Open the web root without signing in and verify that the roadmap position and counts match the deployed document. As a deployment smoke test, update one task's status while retaining its milestone, deploy again, and verify the new count after a page reload. Run `yarn test:roadmap` before deployment; it also checks two independent Vite builds against changed document fixtures.

Registration, sessions, stories, and encrypted platform credentials persist in PostgreSQL and can be shared safely by multiple API replicas.
