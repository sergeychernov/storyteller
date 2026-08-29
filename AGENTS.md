# Storyteller agent guidelines

## Product roadmap maintenance

- Use the terms **product roadmap** and **milestone** in documentation and user communication. Milestones describe product outcomes with completion criteria; P0, P1, P2, and later IDs identify these milestones, not priority levels.

- Before implementing a product feature, read `docs/product-roadmap.md`, identify its stable task ID and the affected interfaces (Web, native Mobile, MCP), and check the dependencies. Keep the release order: Web YouTube MVP → Mobile parity → MCP parity → parallel development. Do not start unrelated work just because it is highlighted.
- Update the product roadmap in the same change as the implementation. Set only the verified interface's status to `done`, and record a concise verification result or remaining work in the row's final column. Shared backend work alone does not complete Mobile or MCP. Partial implementations retain their planned `Pn` status; never mark a task done just because a type, API, placeholder, or documentation exists.
- Preserve stable IDs and independent interface statuses. `Pn` is a target milestone (including P5 and later), not a priority level; `n/a` means inapplicable. Do not silently reschedule tasks or broaden the MVP. Real test publication requires explicit permission for the target channel and visibility.
- Keep completed status cells on a green background and the next ten unfinished task/interface pairs on an orange background. Use the explicit `product-roadmap-order` in the document within the earliest unfinished milestone; do not fill the queue from a later milestone when fewer than ten remain. After MVP parity, pairs for the same feature may be queued for several interfaces. Change the order deliberately when dependencies or the user's priorities change, and include new task IDs exactly once.
- Preserve milestone membership when completing a task: replace `Pn` with `done (Pn)`; the synchronizer renders `![done](assets/product-roadmap/done.svg "Pn")`. For an orange badge, changing only its alt text to `done` also preserves the milestone from its existing path. Never use a bare `done` cell or remove the completed badge's milestone tooltip: public progress depends on it.
- After editing task statuses, run `node scripts/sync-product-roadmap.mjs`. This regenerates local background badges and the next-ten summary without changing completion status or milestone membership. Do not hand-edit generated SVGs or the generated summary.
- The public widget is generated from this same document by the web build. Keep the milestone table and `product-roadmap-public-titles` (EN/RU/SR) in sync; never hardcode progress, the active milestone, or task totals in the UI. Keep document/generator paths in the web deployment watch configuration. Do not claim a remote deployment or watch-path change unless actually performed and verified.
- Write public roadmap copy for potential users and investors: describe capabilities and benefits, not internal parity/catch-up work or protocol names. Keep technical milestone goals and acceptance criteria in the internal document, with public labels in its dedicated titles block.
- Before finishing feature work, run `node scripts/sync-product-roadmap.mjs --check` in addition to the relevant implementation checks. If changing roadmap tooling or public roadmap data, also run `yarn test:roadmap` and `yarn build:web`. Never report completion with stale statuses, colors, or priorities; if verification is blocked, keep the task unfinished and record the blocker.

## Frontend component boundaries

- Split React components by responsibility, not merely by line count. A component should represent one coherent UI or product concern.
- Keep `App`, route components, pages, and layouts focused on composition. Do not place feature forms, data-fetching workflows, session persistence, or large UI sections directly in them.
- Extract a component into its own file when it has its own state or mutations, performs data fetching, represents a distinct semantic or visual section, is reusable, or can be understood and tested independently.
- Prefer one primary exported React component per file. Name the file after that component and colocate feature-specific components under the relevant feature or `components` directory.
- Move non-visual stateful behavior into focused hooks such as `use-persistent-session.ts`. Keep HTTP calls and transport types in API modules rather than embedding `fetch` logic in components.
- Keep small, single-use markup fragments inline when extracting them would hide rather than clarify the parent component's flow. Do not create files for trivial wrappers or a few static elements.
- Avoid oversized "god components" that mix authentication, navigation, remote data, forms, and editor UI. If a component accumulates multiple independent reasons to change, split it before adding more behavior.
- Preserve the repository's ESM import convention: TypeScript source imports local modules using the emitted `.js` extension.
- Before completing frontend work, review every changed page and component for meaningful decomposition and run `yarn check` and the relevant tests.

## Product analytics instrumentation

- Every new user-facing product feature must include analytics instrumentation for its meaningful confirmed outcome on each implemented interface. Extend the typed taxonomy in `@storyteller/analytics`, emit the event only after the operation succeeds, and update `docs/product-analytics.md` in the same change. Do not substitute button-click or form-submit events for a confirmed product outcome.
- Keep the API relay allowlist synchronized with the typed taxonomy and add tests for the new event and its properties. Use stable categorical properties that support funnels or diagnosis; never send emails, names, resource IDs, titles, filenames, URLs, free-form text, raw errors, or media/content data.
- Preserve the privacy defaults: no autocapture, session replay, remote configuration, or IP enrichment without an explicit privacy review and user request. If a feature truly has no user-observable outcome to measure, record that decision in the product roadmap evidence instead of silently omitting analytics.
- Before completing feature work, run the analytics package tests and API relay tests in addition to the checks required by the affected interface.
