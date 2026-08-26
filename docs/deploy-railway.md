# Deploying to Railway

Railway can import this Yarn workspace as a shared JavaScript monorepo. The deployable workspaces expose `build` and `start` scripts, and the API listens on Railway's injected `PORT`.

## Services

Create one Railway project from the GitHub repository and keep these detected services:

| Service | Workspace | Public domain | Notes |
| --- | --- | --- | --- |
| `web` | `@storyteller/web` | yes | React/Vite studio |
| `api` | `@storyteller/api` | yes | Fastify API; attach PostgreSQL; healthcheck is `/health` |
| `worker` | `@storyteller/worker` | no | Placeholder background process |
| `mcp` | `@storyteller/mcp` | only when external MCP clients need it | Placeholder process; it does not expose HTTP yet |

Do not deploy `@storyteller/mobile` to Railway. It is an Expo native application and should be built with EAS or the native store toolchain.

The worker and MCP processes are intentionally placeholders today. Omit them from the Railway project until their integrations are implemented if you want to avoid idle compute cost.

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
The root `railpack.json` adds FFmpeg to the runtime image. The API uses its bundled `ffprobe` command to inspect uploaded videos before adding them to a scene.

## Domains and variables

Generate public domains for `api` and `web`. Then add this variable to the `web` service:

```dotenv
VITE_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}
```

`VITE_API_URL` is compiled into the browser bundle, so changing it triggers a new web deployment. No `PORT` variable needs to be created: Railway injects it for public services.

Attach a Railway PostgreSQL service to the API so Railway injects `DATABASE_URL`. Also configure `PLATFORM_CREDENTIALS_KEY` with the output of `openssl rand -base64 32`, and set `WEB_ORIGIN` to the public web URL (multiple origins may be comma-separated). The API applies migrations during startup.

Create a private Railway Storage Bucket in the same region as the API. Reference its credentials from the API service using these variables:

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

Replace `media` with the bucket service name on the Railway canvas. Keep the bucket private. The API receives and validates uploads with Sharp or FFprobe, stores the validated originals in the bucket, and returns short-lived presigned URLs after authorizing reads. `MEDIA_TEMP_ROOT` may point to ephemeral disk when a custom temporary directory is needed; completed originals never depend on that disk.

The default `MEDIA_STORAGE_DRIVER=local` remains available for local development. A persistent Volume is no longer required for production media storage.

Changing the driver does not copy files that already exist on a local filesystem. Before the first S3 deployment, copy any originals that still need to be preserved into the bucket under their existing `storageKey` paths. Database records whose ephemeral files have already disappeared cannot be recovered by this change and should be removed or uploaded again.

Configure the API healthcheck path as `/health` with a 60-second timeout.

## Watch paths

Railway's automatic monorepo import may initially watch only the application directory. Add these root-relative patterns so shared-package and lockfile changes also redeploy affected services.

### `web`

```text
/apps/web/**
/packages/localization/**
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
/package.json
/yarn.lock
/.yarnrc.yml
/tsconfig.base.json
/tsconfig.json
/railpack.json
```

### `worker` and `mcp`

Use `/apps/worker/**` or `/apps/mcp/**` respectively, plus the five root configuration and lockfile paths shown above. Add shared package paths when those services begin importing application, renderer, or publisher code.

## Verification

After deployment:

```bash
curl --fail "https://<api-domain>/health"
curl --fail "https://<web-domain>/"
```

Registration, sessions, stories, and encrypted platform credentials persist in PostgreSQL and can be shared safely by multiple API replicas.
