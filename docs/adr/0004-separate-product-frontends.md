# ADR 0004: Separate product frontends on one origin

## Status

Accepted.

## Context

The current `apps/web` workspace contains both the public site and Story Studio.
Music Clip Studio has a different product promise, project model and editing UI,
but it should use the same account, subscription and backend platform. Adding it
as another mode inside the existing React tree would couple public content,
story editing and multicamera editing before their boundaries are stable.

The product is still early enough to move the boundary without maintaining
several generations of frontend architecture.

## Decision

- Split the frontend source into three peer workspaces:
  - `apps/site` — public `makeitastory.app`, localized product pages, public
    product roadmap and the neutral account entry;
  - `apps/story-web` — Story Studio only;
  - `apps/clip-web` — Music Clip Studio only.
- Keep one public origin and route the independently built applications by URL
  prefix:
  - `/` and localized public paths — Site;
  - `/app/stories/*` — Story Studio;
  - `/app/clips/*` — Music Clip Studio;
  - `/sign-in` — shared, product-neutral sign-in with a validated return path.
- Keep public product pages separate from authenticated application routes:
  the `/products` chooser, `/products/stories` and `/products/music-clips`, with
  localized equivalents.
- Initially build and serve all three frontend artifacts from one Railway
  frontend service. A small host router selects a static root by request path.
  Separate source workspaces do not require separate runtime services.
- Keep `api.makeitastory.app` as the shared API origin. Story and clip projects
  use the same identity, access, storage and job infrastructure, but separate
  application/domain models.
- Use normal document navigation between the three frontend applications. React
  Router navigation remains internal to one application only.
- Keep the native Mobile application as one distributed binary with separate
  Story and Music Clip navigation trees. A later store-level split must not be
  required by the backend model.
- Include Music Clip Studio in an existing plan version through capabilities and
  shared resource limits. It does not receive a separate price or billing SKU.

## Consequences

- Public-site code no longer grows inside the Story Studio application shell.
- Story and clip editors can use unrelated layouts and state models without a
  product-mode switch in a shared root component.
- One origin preserves simple navigation and the current origin-scoped session
  during migration. The planned HttpOnly API-cookie remains the long-term
  session boundary.
- All three builds must use explicit base paths, isolated asset directories and
  application-specific SPA fallbacks.
- The frontend service deploys atomically at first. Independent deployments can
  be introduced later behind the same path router without changing public URLs.
- A placeholder workspace or route proves only the B16 architecture task. It
  does not complete any Music Clip Studio task in milestones P5 or P6.
- The detailed migration, runtime architecture and P5/P6 product plan live in
  [frontend-products-and-clip-studio-plan.md](../frontend-products-and-clip-studio-plan.md).
