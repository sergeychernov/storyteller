# Storyteller agent guidelines

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
