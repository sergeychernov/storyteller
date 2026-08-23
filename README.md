# Storyteller

Minimal TypeScript monorepo for designing a story-production product from the UI outward.

[`hermes-story-skills`](https://github.com/sergeychernov/hermes-story-skills) remains separate and unchanged. It is a catalog of useful media experiments, not the application workflow for this repository. Renderers will be selected and migrated individually.

## Workspace

- `apps/api` — Fastify API with OpenAPI docs and the first account/story routes
- `apps/worker` — empty background-job boundary
- `apps/mcp` — empty peer interface to the future application layer
- `apps/web` — React/Vite studio with account onboarding, story creation, and an editor shell
- `apps/mobile` — Expo Router companion app shell
- `packages/application` — transport-independent use cases shared by API and future MCP tools
- `packages/localization` — typed English, Russian, and Serbian Latin product copy shared by web and mobile
- `packages/domain` — first small story model and lifecycle rules
- `packages/schemas` — transport request contracts
- `packages/renderer` — FFmpeg process boundary; no concrete renderers yet
- `packages/publishers` — provider-neutral publication port; no adapters yet

## Commands

```bash
corepack enable
yarn install
yarn test
yarn check
```

Run the API and web studio together:

```bash
yarn dev
```

Then open [http://localhost:3000](http://localhost:3000). The API runs at [http://localhost:3001](http://localhost:3001), and its interactive documentation is at [http://localhost:3001/docs](http://localhost:3001/docs).

Use `yarn dev:services` for API + worker + MCP, `yarn dev:all` for every non-mobile app, or `yarn dev:mobile` to start Expo separately. Individual commands remain available as `yarn dev:api`, `yarn dev:web`, `yarn dev:worker`, and `yarn dev:mcp`.

Production deployment of the web studio, API, worker, and MCP boundary is prepared for Railway. See [`docs/deploy-railway.md`](docs/deploy-railway.md) for service setup, variables, domains, and watch paths. The Expo mobile app is distributed separately through native app stores or EAS.

The first vertical slice uses in-memory storage intentionally. Restarting the API clears accounts and stories; persistence will be selected after the editor flow stabilizes.

Web and mobile initially follow the system language and expose an in-app selector for English, Russian, and Serbian Latin. The chosen language is persisted locally on each client.

See [`docs/product-scope.md`](docs/product-scope.md) for the first API surface and [`docs/migration-plan.md`](docs/migration-plan.md) for the incremental plan.
