# Storyteller agent guidelines

## Git changes and review

- Never run `git add` or otherwise modify the Git index unless the user explicitly authorizes that specific staging action. A request to implement, fix, prepare, finish, commit, push, or deploy is not staging authorization. Leave completed edits unstaged by default. Preserve any files already staged by the user: do not stage additional changes, unstage files, or run commands such as `git restore --staged` or `git reset` without separate explicit permission.
- Leave completed changes uncommitted so the user can review and commit them. Never run `git commit` unless the user explicitly authorizes that specific commit after reviewing the current changes; a request to implement, finish, deploy, or mark a task done is not commit authorization.
- Never run `git push` unless the user explicitly authorizes that specific push. Commit permission does not imply push permission, and prior permission does not carry over to later commits or pushes. Prefer handing off the working-tree diff, verification results, and a suggested commit message so the user can commit and push personally.

## Product roadmap maintenance

- Use the terms **product roadmap** and **milestone** in documentation and user communication. Milestones describe product outcomes with completion criteria; do not recreate the retired `P0`–`P6` identifiers.

- GitHub Issues and GitHub Milestones are the source of truth for product tasks, interface scope, status, release membership, dates, dependencies, acceptance criteria, and evidence. `docs/product-roadmap.md` contains only source rules and localized public milestone titles; do not recreate a task table or status snapshot in the repository.
- Before implementing a product feature, read its GitHub issue, the assigned milestone, linked dependencies, and `docs/product-roadmap.md`. Keep the release order: Web YouTube MVP → Mobile parity → MCP parity → parallel development. Do not start unrelated work merely because it is nearby in the issue list.
- One issue represents one independently verifiable result for exactly one interface label: `backend`, `web`, `mobile`, or `mcp`. Shared backend work alone does not complete Web, Mobile, or MCP. Split results that require independent interface acceptance instead of combining their statuses.
- Assign product roadmap milestones only to issues, never to pull requests, because GitHub includes both in milestone issue counters.
- Keep issue bodies self-sufficient: outcome, scope boundaries, dependencies, completion criteria, implementation evidence, and remaining work belong in the issue. Update the issue in the same change as the implementation. Do not duplicate that evidence in `docs/product-roadmap.md`.
- Close an issue with reason `completed` only after that interface's criteria are verified. Partial implementations remain open; a type, API, placeholder, build, or documentation alone does not prove a user-facing result. Erroneously created roadmap issues are deleted rather than closed. Preserve the issue's milestone when completing it.
- Schedule and reschedule by changing the issue's GitHub milestone; maintain the milestone due date in GitHub. Do not silently broaden the milestone or change release order. Real test publication requires explicit permission for the target channel and visibility.
- The public widget reads GitHub milestone `open_issues`, `closed_issues`, and `due_on` through the Site's server-side endpoint. Never hardcode progress, the active milestone, task totals, or dates in the UI. Keep `product-roadmap-public-titles` keyed by stable GitHub milestone number and synchronized with the product roadmap milestones; other GitHub milestones are intentionally excluded. Write public labels for potential users and investors.
- Whenever the development agent completes and closes a product roadmap issue, it must delegate priority refresh to a subagent before finishing the task. The subagent reads the current GitHub milestone and the complete bodies, dependencies, labels, and acceptance criteria of all its open issues; selects exactly the three issues that most improve the milestone's critical path and user value (or every issue when fewer than three remain); and replaces the repository's pinned issues through the existing connected GitHub tooling or signed-in GitHub UI. The subagent must not require a repository workflow, separate API key, or parallel next-ten queue. Pins are planning focus, not task status. If the existing GitHub connection cannot mutate pins, report that blocker instead of introducing another integration.
- Before finishing feature work, verify the relevant issue state/body/labels/milestone and run the checks required by the affected interface. If changing roadmap aggregation, endpoint behavior, or public titles, also run `yarn test:roadmap`, `yarn test:site`, and `yarn build:web`. If verification is blocked, keep the issue open and record the blocker.

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

## Reuse and third-party libraries

- Before implementing a common capability from scratch, inspect the repository and its workspace dependencies for an existing utility, service, hook, component, or established pattern that already solves the problem. Prefer extending or composing the canonical existing solution over creating a parallel abstraction or duplicating behavior.
- For standard, well-understood problems, prefer a mature, well-known, actively maintained npm package over a bespoke implementation when it fits the project's architecture, runtime, and license requirements. Reuse a compatible dependency already present in the workspace before adding another package with overlapping functionality.
- Add a new dependency only after checking its maintenance status, security posture, bundle or runtime cost, TypeScript support, and compatibility with the repository's supported environments. Implement locally when the requirement is small and project-specific, or when available packages introduce disproportionate risk, weight, or complexity; record the reason when that choice is not obvious.
- Reuse existing design-system components, shared UI primitives, API clients, schemas, types, test helpers, and conventions. When reuse is awkward, improve the shared solution if doing so remains coherent for its existing consumers instead of bypassing it with a one-off variant.

## Product analytics instrumentation

- Every new user-facing product feature must include analytics instrumentation for its meaningful confirmed outcome on each implemented interface. Extend the typed taxonomy in `@storyteller/analytics`, emit the event only after the operation succeeds, and update `docs/product-analytics.md` in the same change. Do not substitute button-click or form-submit events for a confirmed product outcome.
- Keep the API relay allowlist synchronized with the typed taxonomy and add tests for the new event and its properties. Use stable categorical properties that support funnels or diagnosis; never send emails, names, resource IDs, titles, filenames, URLs, free-form text, raw errors, or media/content data.
- Preserve the privacy defaults: no autocapture, session replay, remote configuration, or IP enrichment without an explicit privacy review and user request. If a feature truly has no user-observable outcome to measure, record that decision in its GitHub issue evidence instead of silently omitting analytics.
- Before completing feature work, run the analytics package tests and API relay tests in addition to the checks required by the affected interface.
