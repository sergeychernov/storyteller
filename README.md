# Storyteller

Minimal TypeScript monorepo for designing a story-production product from the UI outward.

[`hermes-story-skills`](https://github.com/sergeychernov/hermes-story-skills) remains separate and unchanged. It is a catalog of useful media experiments, not the application workflow for this repository. Renderers will be selected and migrated individually.

## Workspace

- `apps/api` — empty HTTP application boundary
- `apps/worker` — empty background-job boundary
- `apps/mcp` — empty peer interface to the future application layer
- `apps/web` — empty web application boundary
- `apps/mobile` — empty mobile application boundary
- `packages/domain` — first small story model and lifecycle rules
- `packages/schemas` — transport request contracts
- `packages/renderer` — FFmpeg process boundary; no concrete renderers yet
- `packages/publishers` — provider-neutral publication port; no adapters yet

## Commands

```bash
npm install
npm test
npm run check
```

See [`docs/product-scope.md`](docs/product-scope.md) for the first API surface and [`docs/migration-plan.md`](docs/migration-plan.md) for the incremental plan.
