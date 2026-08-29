# Minimal migration plan

`hermes-story-skills` stays unchanged and outside this repository. It is consulted only when a specific renderer or media behavior is chosen for migration. No legacy manifest or chatbot workflow is imported into the product model.

This document is architectural context. Release order and product scope follow the [product roadmap](product-roadmap.md): Web YouTube MVP, native Mobile, MCP, further channels, monetization and built-in AI in milestone P4, then Music Clip Studio for simultaneous camera angles in P5 and separate takes/musician parts in P6. The early B16 frontend split is described in [frontend-products-and-clip-studio-plan.md](frontend-products-and-clip-studio-plan.md). MVP creation and publication do not require AI calls or a story brief; Music Clip Studio reuses platform infrastructure but not the Story/Scene product model.

## Phases

1. **Foundation (this change):** compileable empty apps, API scope, a minimal lifecycle, scene editing rules, FFmpeg runner and publisher port.
2. **First vertical slice:** persistence plus create-account, create-story, create-scene and material upload; expose the same application service through HTTP and MCP.
3. **Preview slice:** choose one useful renderer, add idempotent jobs and build scene/story preview plus timeline queries.
4. **Audio slice:** user-recorded narration, uploaded music and mixing behind provider-neutral ports. Music generation is deferred to milestone P4 with monetization.
5. **Publication slice:** account provider linking and one publisher adapter.
6. **Selective migration:** port another renderer only when the UI needs it. Keep specialized CV/audio/ML in Python behind typed worker ports.

## Safety rules

- Applications contain transport/UI code; domain rules remain transport-neutral.
- Editing a ready story returns it to `draft` and increments its revision.
- Rendering cannot start until each scene has material and a selected renderer.
- MCP and HTTP are peer interfaces to the same future application services.
- No concrete renderer or platform provider belongs in the foundation.
