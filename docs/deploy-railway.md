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

| Service | Build command | Start command |
| --- | --- | --- |
| `web` | `yarn workspace @storyteller/web build` | `yarn workspace @storyteller/web start` |
| `api` | `yarn workspace @storyteller/api build` | `yarn workspace @storyteller/api start` |
| `worker` | `yarn workspace @storyteller/worker build` | `yarn workspace @storyteller/worker start` |
| `mcp` | `yarn workspace @storyteller/mcp build` | `yarn workspace @storyteller/mcp start` |

Railway should install dependencies with `yarn install --immutable`; the repository pins Yarn 4 through `packageManager`.
The root `railpack.json` adds FFmpeg to the runtime image. The API uses `ffprobe` to inspect uploads and `ffmpeg` to separate video/audio and denoise/normalize audio before adding the material to a scene. Allow temporary disk space and request time for this processing, in addition to the uploaded file size.

## Domains and variables

Generate public domains for `api` and `web`. Then add this variable to the `web` service:

```dotenv
VITE_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}
```

`VITE_API_URL` is compiled into the browser bundle, so changing it triggers a new web deployment. No `PORT` variable needs to be created: Railway injects it for public services.

The public homepage at `/` includes a roadmap widget. Every web build (including a direct `vite build`) reads `docs/product-roadmap.md` through the [Vite plugin](../scripts/vite-public-roadmap.mjs) and embeds a validated public summary in the content-hashed bundle. There is no manually maintained JSON snapshot or runtime API dependency. Invalid milestone definitions/statuses fail the build. Completed task cells retain their original milestone as `done (Pn)` / the generated badge tooltip.

This refreshes the widget on **site deployment**, not on YouTube story publication. The existing static server serves `index.html` with `no-cache`; new page loads receive the new hashed bundle. An already-open production page needs a reload. Update the web service's watch paths below so a document-only commit triggers deployment as well; editing this guide does not change existing Railway service settings.

Attach a Railway PostgreSQL service to both the API and worker so both receive the same `DATABASE_URL`. Configure `PLATFORM_CREDENTIALS_KEY` on the API with the output of `openssl rand -base64 32`, and set `WEB_ORIGIN` to the public web URL (multiple origins may be comma-separated). The API applies migrations during startup; the worker safely retries while it is waiting for those tables.

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

Replace `media` with the bucket service name on the Railway canvas. Keep the bucket private. The API stores validated originals plus separate video and processed audio working tracks. The worker downloads the tracks needed for the selected export, renders MP4 or audio-only M4A with FFmpeg, uploads the result, and records its stable object key in PostgreSQL. Authorized reads may use short-lived presigned URLs. `MEDIA_TEMP_ROOT` may point to ephemeral disk when a custom upload directory is needed; completed originals, tracks and exports never depend on that disk. Deploy API, worker and web together so that all services understand video export jobs and metadata-only video edits.

The default `MEDIA_STORAGE_DRIVER=local` remains available for local development. A persistent Volume is no longer required for production media storage.

Changing the driver does not copy files that already exist on a local filesystem. Before the first S3 deployment, copy any originals that still need to be preserved into the bucket under their existing `storageKey` paths. Database records whose ephemeral files have already disappeared cannot be recovered by this change and should be removed or uploaded again.

Configure the API healthcheck path as `/health` with a 60-second timeout.

## Watch paths

Railway's automatic monorepo import may initially watch only the application directory. Add these root-relative patterns so shared-package and lockfile changes also redeploy affected services.

### `web`

```text
/apps/web/**
/packages/localization/**
/docs/product-roadmap.md
/scripts/public-roadmap.mjs
/scripts/sync-product-roadmap.mjs
/scripts/vite-public-roadmap.mjs
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
/packages/domain/**
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
