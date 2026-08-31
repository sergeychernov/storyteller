# Storyteller

Minimal TypeScript monorepo for designing a story-production product from the UI outward.

[`hermes-story-skills`](https://github.com/sergeychernov/hermes-story-skills) remains separate and unchanged. It is a catalog of useful media experiments, not the application workflow for this repository. Renderers will be selected and migrated individually.

## Workspace

- `apps/api` — Fastify API with OpenAPI docs, authenticated profiles, and story routes
- `apps/worker` — PostgreSQL-backed scene render and object-cleanup worker
- `apps/mcp` — empty peer interface to the future application layer
- `apps/site` — public React/Vite site, product-neutral sign-in and the one-origin frontend host
- `apps/story-web` — Story Studio React/Vite application under `/app/stories/*`
- `apps/clip-web` — isolated Clip Studio React/Vite shell under `/app/clips/*`
- `apps/mobile` — Expo Router companion app shell
- `packages/auth-client` — shared same-origin browser session and validated return-path handling
- `packages/application` — transport-independent use cases shared by API and future MCP tools
- `packages/localization` — typed English, Russian, and Serbian Latin product copy shared by web and mobile
- `packages/domain` — first small story model and lifecycle rules
- `packages/schemas` — transport request contracts
- `packages/renderer` — FFmpeg process boundary, animated still images, video exports and audio processing
- `packages/render-queue` — persistent render cache, worker leases, and object-deletion queue
- `packages/storage` — shared local/S3 object-storage adapters for API and worker
- `packages/publishers` — provider-neutral publication port; no adapters yet

## Commands

```bash
corepack enable
yarn install
yarn test
yarn check
```

Build the three frontend artifacts, then run the API, render worker, and one-origin frontend host together:

```bash
cp .env.example .env
# Fill PLATFORM_CREDENTIALS_KEY once with: openssl rand -base64 32
yarn dev
```

The local API dev and migration commands automatically load the repository-root `.env`. Existing process variables take precedence, so Railway continues to use its service variables.

To apply database migrations explicitly, run `yarn build:backend` followed by `yarn db:migrate`. The migration command needs only `DATABASE_URL`; Railway runs it before deploying either backend service. CI verifies upgrades and compatibility on disposable PostgreSQL. Run those tests locally with `STORYTELLER_TEST_DATABASE_URL=postgresql://... yarn test:api:postgres` against a disposable database, never production. See the [CI/CD guide](docs/deploy-railway.md#database-migrations-in-cicd) for the first F05.1 rollout order and Railway settings.

Then open [http://localhost:3000](http://localhost:3000). The API runs at [http://localhost:3001](http://localhost:3001), and its interactive documentation is at [http://localhost:3001/docs](http://localhost:3001/docs).

Use `yarn dev:services` for API + worker + MCP, `yarn dev:all` for every non-mobile service, or `yarn dev:mobile` to start Expo separately. `yarn dev:web` rebuilds and serves Site, Story Studio, and Clip Studio from one origin. Isolated Vite servers remain available as `yarn dev:site`, `yarn dev:story-web`, and `yarn dev:clip-web`; individual backend commands are `yarn dev:api`, `yarn dev:worker`, and `yarn dev:mcp`.

Run `yarn storybook` to develop Story Studio components locally at `http://localhost:6006`; the stories use generated media fixtures and do not require the API or database. Run `yarn build:storybook` to verify the static Storybook bundle. Storybook is a local development tool and is not part of the Railway deployment.

Scene downloads require the worker and FFmpeg (`ffmpeg` and `ffprobe` on `PATH`). If API and web were started separately, also run `yarn dev:worker`; otherwise render jobs remain queued. When using local storage, API and worker must share the same `MEDIA_ROOT` (the default resolves to the repository's `.storyteller-media` directory).

### Video tracks and downloads

Video uploads also require FFmpeg in the API runtime. The uploaded original stays unchanged at `material.storageKey`. The API stores a video-only working copy at `videoTrack` (stream copy, without re-encoding) and, when sound exists, a separate `audioTrack` in AAC/M4A, stereo, 48 kHz. Audio is denoised with `afftdn=nr=12:nf=-35:tn=1` and normalized with two-pass `loudnorm=I=-16:LRA=11:TP=-1.5`, following the [spoken-video reference](https://github.com/sergeychernov/hermes-story-skills/blob/main/skills/media/photo-story-archive/references/spoken-video-audio-integrity.md). No silence removal or noise gate is used. Silent tracks bypass undefined loudness gain. The exact filter and measured encoded loudness/true peak are saved with the audio track.

Video rotation, crop, and trim are saved as metadata, using the original timeline. Saving an edit does not rewrite either working track or the original. The editor synchronizes video and processed audio, and the waveform reads the separate audio track.

For a scene containing one video, download offers video only (MP4), audio only (M4A), or video with audio (MP4), applying the selected range and spatial edits at export. The render request accepts `{ "mode": "video" | "audio" | "combined" }`; requests without a mode remain supported. Audio-only jobs do not download or decode the video working track. A video without sound cannot produce an audio-only export. Existing uploads remain readable and editable; their sound is processed during export when a separate track is absent. They are not bulk-migrated.

Production deployment of the one-origin frontend host, API, worker, and MCP boundary is prepared for Railway. See [`docs/deploy-railway.md`](docs/deploy-railway.md) for service setup, variables, domains, and watch paths. The Expo mobile app is distributed separately through native app stores or EAS.

The API persists profiles, sessions, stories, render jobs, cached artifact keys, and encrypted platform credentials in PostgreSQL. Set `DATABASE_URL` and a base64-encoded 32-byte `PLATFORM_CREDENTIALS_KEY`; the API applies versioned migrations on startup. The worker uses the same `DATABASE_URL` and object-storage configuration.

Generate the credentials encryption key with `openssl rand -base64 32`. It must be kept stable between deployments or existing Telegram, TikTok, and Instagram credentials will become unreadable.

Site, both Web applications, and Mobile initially follow the system language and expose an in-app selector for English, Russian, and Serbian Latin. The chosen language is persisted locally on each client.

See [`docs/product-scope.md`](docs/product-scope.md) for the first API surface and [`docs/migration-plan.md`](docs/migration-plan.md) for the incremental plan.

See [`docs/product-roadmap.md`](docs/product-roadmap.md) for the product roadmap with milestones, independent Web, Mobile, and MCP task statuses, and completion criteria for functional parity with Hermes Story Skills.

See [`docs/product-analytics.md`](docs/product-analytics.md) for the Amplitude event taxonomy, privacy boundary, environment variables, and first dashboard.

The frontend split and milestone P5/P6 Music Clip Studio architecture are documented in [`docs/frontend-products-and-clip-studio-plan.md`](docs/frontend-products-and-clip-studio-plan.md) and [ADR 0004](docs/adr/0004-separate-product-frontends.md). P5 covers one simultaneous performance from several camera angles; P6 adds separate takes and musician parts with independent audio and video editing. `apps/site`, `apps/story-web`, and `apps/clip-web` now build independently and are served by one frontend host on the `makeitastory.app` origin.

The public homepage at `/` shows milestone progress computed from that document on every Site build. Run `yarn test:roadmap` to check progress calculation and build-time refresh. For document-only redeploys, include the roadmap and its generators in the frontend service's [Railway watch paths](docs/deploy-railway.md#web).
