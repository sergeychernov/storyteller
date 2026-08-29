# Frontend products and Music Clip Studio plan

Date: 29.08.2026. Status: approved product and architecture plan; implementation
has not started.

Related product roadmap tasks:

- **B16** — perform the early frontend separation before access-control and
  editor work adds more dependencies to the current combined `apps/web`;
- **F18.0** — announce Music Clip Studio through the public product chooser and
  localized prelaunch page in P3;
- **F18.1–F18.7** — deliver simultaneous multicamera Music Clip Studio in P5;
- **F19.1–F19.8** — add separate takes, musician parts and independent audio/video editing in P6.

The stable architectural decision is recorded in
[ADR 0004](adr/0004-separate-product-frontends.md). This document defines the
migration sequence, runtime boundaries, product model and acceptance criteria.

## Goals

1. Give the public site, Story Studio and Music Clip Studio independent source,
   routing and UI boundaries.
2. Keep one public brand, origin, account and subscription.
3. Preserve the existing public pages and Story Studio behavior while moving
   them; the restructuring must not silently change product functionality.
4. Make Music Clip Studio a real sibling product experience rather than a mode
   inside `StoryEditor`, delivered first for simultaneous camera angles and then
   for separately recorded performances/parts.
5. Reuse platform infrastructure without forcing clip projects into the Story,
   Scene and Material aggregate.
6. Keep a later split into independently deployed frontends possible without
   changing the public URL scheme.

## Non-goals of the early restructuring

- Implementing clip-project domain entities, synchronization or rendering.
- Publishing empty Music Clip Studio functionality as available.
- Changing the native Mobile store listing.
- Changing pricing, creating a Clip tariff or choosing new billing products.
- Moving the API, worker, PostgreSQL or object storage to new services.
- Changing production DNS or Railway services merely because this plan exists.

## Target repository boundaries

```text
apps/
  site/                 Public site, SEO/prerender and neutral sign-in
  story-web/            Story Studio React/Vite application
  clip-web/             Music Clip Studio React/Vite application
  mobile/               One native binary, separate product route trees
  api/                  Shared HTTP transport
  worker/               Shared asynchronous media jobs until load requires a split
  mcp/                  Peer operational interface
  admin/                Planned independent administrative application

packages/
  application/          Story application services until deliberately renamed/split
  domain/               Story domain until deliberately renamed/split
  clip-application/     P5/P6 clip-project use cases
  clip-domain/          P5/P6 clip, sync, audio-mix and visual-edit rules
  auth-client/          Shared browser session and authenticated API helpers
  localization/         Shared EN/RU/SR Latin dictionaries
  renderer/             Shared FFmpeg/process boundary
  render-queue/         Shared job primitives; project-specific jobs stay typed
  storage/              Shared object-storage boundary
```

`clip-application`, `clip-domain` and `auth-client` are target boundaries, not
directories that already exist. Create them only in the implementation task that
uses them. Do not rename the current story packages as part of B16 unless the
move is mechanical and all import/deployment references are verified; the
frontend split does not require a risky backend package migration.

## Public URL contract

| URL | Owner | Purpose |
| --- | --- | --- |
| `/` | Site | Default-locale public home |
| `/ru`, `/sr` and localized descendants | Site | Localized public pages |
| `/products` | Site | Public product chooser: Story Studio available, Music Clip Studio announced |
| `/products/stories` | Site | Public Story Studio positioning |
| `/products/music-clips` | Site | Public Music Clip Studio positioning |
| `/sign-in` | Site | Product-neutral account entry |
| `/app` | Site | Authenticated or sign-in-aware product chooser |
| `/app/stories/*` | Story Web | Story library and editor |
| `/app/clips/*` | Clip Web | Clip library and multicamera editor |

Localized public product pages use the existing locale URL rules. Authenticated
application URLs do not include a locale segment: the saved profile/client
locale controls application copy.

The sign-in route accepts only a same-origin application return path, for
example `/sign-in?continue=/app/clips`. Reject absolute URLs, protocol-relative
URLs and paths outside an explicit allowlist to prevent open redirects.

### Compatibility redirects

During B16 keep old Story Studio links working:

| Old path | New path | Behavior |
| --- | --- | --- |
| `/stories` | `/app/stories` | Permanent redirect after verification |
| `/stories/:storyId` | `/app/stories/:storyId` | Preserve project ID |
| `/stories/:storyId/scenes/:sceneId` | `/app/stories/:storyId/scenes/:sceneId` | Preserve project and scene IDs |

Keep `/sign-in` stable. Do not redirect unknown public locale paths into an
application: they must retain real `404` behavior.

## Runtime and deployment architecture

### Initial topology

```text
Browser
  |
  | https://makeitastory.app
  v
Frontend host (one Railway public service)
  |-- /, /ru/*, /sr/*       -> apps/site/dist
  |-- /app/stories/*        -> apps/story-web/dist/index.html
  |-- /app/clips/*          -> apps/clip-web/dist/index.html
  |-- static asset request  -> matching application's dist root
  |
  +---- https://api.makeitastory.app -> Fastify API
                                         |-- PostgreSQL
                                         |-- private object storage
                                         `-- private worker/queue
```

Keep the existing Railway frontend service initially even if its display name
remains `web`. Its build command must build all three frontend workspaces; its
start command runs the static host owned by `apps/site`. One domain is attached
to one public frontend entry point.

The first implementation should serve built files directly from the three
workspace `dist` directories rather than copying them into an undocumented
combined tree. The host must resolve and validate each path against its selected
root so a request cannot traverse into another workspace or the repository.

### Build configuration

- Site keeps base `/` and owns prerender, sitemap, robots, canonical/hreflang
  generation and the public roadmap Vite plugin.
- Story Web uses Vite base `/app/stories/` and React Router basename
  `/app/stories`.
- Clip Web uses Vite base `/app/clips/` and React Router basename `/app/clips`.
- Each application emits its own hashed assets below its base path. Never depend
  on filenames from another frontend build.
- Cross-product navigation uses ordinary same-origin links, causing a document
  navigation. A router `Link` must not cross an application boundary.
- HTML, `robots.txt` and `sitemap.xml` use `no-cache`; content-hashed assets use
  long-lived immutable caching.
- All `/app/**` documents include `noindex, nofollow`; the public sitemap excludes
  them.
- Do not register a root-scoped service worker. If offline support is added,
  each application owns a path-scoped worker that cannot intercept its siblings.

### Later independent deployments

If build duration, release cadence or traffic justifies separate frontend
services, keep the external URL contract and replace only the implementation of
the frontend host:

```text
Frontend gateway
  |-- / and public paths -> site service
  |-- /app/stories/*     -> story-web service
  `-- /app/clips/*       -> clip-web service
```

Upstreams use Railway private networking and do not need their own public
domains. This is not part of B16: atomic deployment is simpler and safer at the
current scale.

## Session and access boundaries

The current Web stores an opaque bearer session in origin-scoped local storage.
On one origin, Story Web and Clip Web can restore the same session if the key and
validation logic are shared through `packages/auth-client`. The public site must
not duplicate or reinterpret the token format.

B16 preserves existing authentication behavior. B13 then adds the capability
resolver and server-side enforcement. The already planned secure target remains
the host-only HttpOnly cookie on `api.makeitastory.app`, sent with
`credentials: include` from allowed first-party origins. Do not create a
`Domain=.makeitastory.app` JavaScript-readable cookie.

The neutral product chooser shows only products for which effective access
contains at least one usable action. Absence from navigation is not an access
control: every API operation still verifies capability and resource ownership.

Initial clip capability keys planned for P5:

```text
clip.project.list
clip.project.create
clip.project.read
clip.project.update
clip.media.upload
clip.sync.run
clip.edit
clip.export
```

Use shared plan versions and typed resource limits. Candidate limits include
storage bytes, render minutes, concurrent jobs and takes per clip project. Exact
commercial values are deliberately not chosen here.

## B16 — early frontend separation

B16 is a behavior-preserving architectural change in milestone P0 and is placed
before B13/B14/B15 and further Story Editor work. It is done only after all
current public and authenticated routes work from their new owners.

### Stage 1 — capture current behavior

- Inventory public, sign-in, story-library and deep editor routes.
- Add routing/SEO fixtures for every EN/RU/SR public path and representative
  authenticated deep links before moving files.
- Record the current production redirects, caching headers, noindex behavior and
  API origin configuration.
- Identify imports from public-site components into editor code and editor imports
  into public code. Shared product-neutral code must move to a package rather
  than producing cross-app source imports.

### Stage 2 — create Site

- Create `apps/site` as a React/Vite workspace.
- Move public page components, public-site data/types, SEO components, public
  styles and Product Roadmap UI from `apps/web`.
- Move public-site and roadmap Vite plugins/prerender ownership to Site without
  duplicating the source document.
- Implement the neutral `/sign-in` and `/app` entry without importing either
  product editor.
- Preserve all 12 current localized public URLs, canonical/hreflang, structured
  data, real 404s, sitemap and robots behavior.

### Stage 3 — rename Web to Story Web

- Rename `apps/web` to `apps/story-web` and package
  `@storyteller/web` to `@storyteller/story-web` in one mechanical change.
- Remove public routes and public build plugins from its `App`.
- Set its application base to `/app/stories/` and update internal routes without
  changing story, scene or material semantics.
- Update TypeScript project references, root scripts, tests, CI commands,
  Railway build/start commands, watch paths and documentation.
- Keep compatibility redirects in the frontend host, not scattered through
  Story Web components.

### Stage 4 — create Clip Web boundary

- Create `apps/clip-web` with its own root application, localization boundary,
  error/loading shell and authenticated route guard.
- The initial route may state that Music Clip Studio is planned. It must not show
  fake projects, accept files or mark F18/F19 tasks done.
- Do not import Story Editor components or story-specific API functions.
- Shared visual tokens may live in a small package, but each product owns its
  layout and feature components.

### Stage 5 — add the frontend host

- Replace the current combined static server with the explicit routing table in
  this document.
- Serve each SPA fallback only for its own prefix. Unknown files under an app
  prefix return `404` rather than silently returning HTML.
- Preserve public trailing-slash normalization and locale-specific unknown-path
  `404`s.
- Add security headers appropriate to public and authenticated documents and
  keep API CORS restricted to exact origins.

### Stage 6 — verify and deploy atomically

- Run `yarn check`, public-site tests, product roadmap tests, relevant Web tests
  and all three frontend builds.
- Browser-check public pages at 320/390/1280 px and Story Studio at mobile and
  desktop widths.
- Verify direct navigation and reload for Story library, story, scene and clip
  shell paths.
- Verify sign-in, sign-out, session restoration, allowed `continue` redirects
  and rejection of external return targets.
- Verify `robots.txt`, sitemap, canonical/hreflang, `404`, `noindex`, cache
  headers and absence of asset-path collisions.
- Update Railway watch paths and commands only during the implementation. Read
  the saved settings back and verify the exact deployed commit before claiming
  remote completion.
- Keep a rollback deployment of the previous combined frontend available. The
  database and API do not change in B16, so rollback must not require data
  migration.

### B16 completion criteria

- `apps/site`, `apps/story-web` and `apps/clip-web` exist and build independently.
- One local/production host serves the documented paths on
  `makeitastory.app` without redirect loops or cross-app asset failures.
- Existing public pages and Story Studio workflows remain functional.
- Old Story Studio deep links redirect while preserving IDs.
- Sign-in and session restoration work for both application prefixes.
- Site owns public SEO; both applications are excluded from indexing.
- Tests and browser verification are recorded in the B16 product roadmap row.
- No F18/F19 status is marked done from shell or routing work alone.

## Music Clip Studio product definition

### Positioning

Story Studio turns heterogeneous personal media into a narrated story. Music
Clip Studio turns recordings of one song into a coherent performance clip. It
is delivered through two explicit public outcomes:

> P5: one performance, multiple camera angles, one finished clip.
>
> P6: performances recorded separately, with sound and video mixed independently.

The public site presents both as products under Make It a Story. Music Clip
Studio receives a dedicated landing page but no separate pricing page or brand
account.

### P5 capture and synchronization contract

P5 accepts one simultaneous performance recorded by several devices. Camera
audio represents the same acoustic event. Feature correlation estimates offset;
multiple windows estimate device clock drift. One angle is the reference
timeline, and one approved recording/mix supplies uninterrupted master audio.

P5 does not promise alignment of different performances. Files that contain
different musical execution must be rejected or explicitly deferred to the P6
workflow rather than forced into the simultaneous algorithm.

### P6 recording and synchronization contract

P6 accepts several performances of the same song and separately recorded parts
from musicians. Equal BPM does not make waveforms identical. The session
therefore requires a shared guide track/reference timeline and should provide a
two-bar count-in plus identifiable sync cue. A metronome heard only in headphones
but absent from the uploaded sources is not itself a shared recorded signal.

Each performer/instrument may contribute independent audio-only, video-only or
combined files and several takes. Musical features and manual bar/beat anchors
map those recordings to the guide. Audio-take selection/mixing and video-take
selection/editing are separate decisions.

Synchronization never silently claims success. Each take stores confidence,
evidence and warnings. Low-confidence results remain editable through waveform,
beat/bar markers and manual anchor pairs.

P5 automatic correction may compensate device clock drift. P6 must not
materially time-stretch a different human performance merely to imitate
frame-accurate identity. Musical alignment maps sections and edit points; the
user remains able to choose another take when performances diverge.

## Clip domain model

Do not add a `musicVideoMode` to `Story`. Define a separate aggregate whose
revision protects synchronization and edit decisions from stale writes.

```text
ClipProject
  id, profileId, title, state, revision
  captureMode: simultaneous-multicam | guided-separate-performances
  referenceTimeline
  selectedMasterAudio
  angles[]
  performanceParts[]?
  musicalTimeline
  audioMix?
  visualDecisionList[]
  outputProfile
  approvals
  renderArtifacts[]
```

P5 creates only `simultaneous-multicam` projects. P6 adds
`guided-separate-performances`; designing the discriminated model early does not
make the P6 mode available or complete.

### Reference timeline and master audio

For P5 the reference timeline comes from one selected simultaneous angle. Its
camera audio or another recording of the same event may become uninterrupted
master audio. For P6 the reference timeline comes from an immutable uploaded
guide track with content hash, duration and optional BPM/count-in metadata; the
final approved AudioMix is a separate artifact.

### Simultaneous angle (P5)

```text
ClipAngle
  id, sourceAsset, presentationProxy, scratchAudio
  sourceTimestamps, orientation, frameRateProfile
  syncMap, syncConfidence, syncWarnings
  enabled, label, colorCorrectionMetadata
```

The source remains immutable. A constant-frame-rate presentation proxy makes
browser playback predictable while source timestamp mapping preserves access to
the original for final rendering.

### Performance part and takes (P6)

```text
PerformancePart
  id, performerId?, instrument, label
  audioTakes[]
  videoTakes[]
  combinedTakes[]
  selectedAudioTakeId?
  selectedVideoTakeIds[]
  musicalMappings[]
```

Audio and video sources have independent stable IDs and roles even when they
originate in one container. Replacing the selected video take never silently
replaces the audio take, and vice versa.

### Audio mix (P6)

```text
ClipAudioMix
  referenceTimelineHash
  tracks[]: takeId, trim, offset, gain, pan, mute, fades, eq, dynamics
  master: gain, loudnessTarget, truePeakCeiling
  revision, approval
```

The mix is non-destructive and versioned. `solo` is a monitoring state rather
than persisted export intent unless explicitly converted to mute decisions.

### Sync map

P5 stores reference offset and bounded clock-rate correction for the same event.
P6 stores ordered musical anchor pairs or a monotonic piecewise mapping to the
guide timeline. Every automatic result records algorithm version and input hashes
so it can be invalidated and reproduced.

### Visual decision list

The program track is non-destructive data, not a flattened preview:

```text
ClipVisualDecision
  id
  startReferenceSeconds
  endReferenceSeconds
  videoTakeId
  transition: cut | dissolve
  layoutId?
  framingOverride?
```

Intervals must be ordered, non-overlapping and within the approved reference
timeline. Gaps either show an explicit slate/black interval or fail validation;
the renderer must not choose a camera implicitly. In P6, audio continues from the
approved AudioMix regardless of which performer or layout is visible.

## Processing pipeline

### Ingest

1. Validate container, codecs, duration, dimensions, rotation metadata and audio
   presence.
2. Store the immutable original and content hash.
3. Produce a small presentation proxy with normalized orientation and constant
   frame rate.
4. Extract mono analysis PCM and waveform; retain a separate scratch-audio
   reference if needed.
5. Record source-to-proxy timestamp mapping and enqueue synchronization.

Large uploads should use resumable/direct-to-object-storage upload before P5 is
declared ready and the same path must accept P6 part/take media. The API
authorizes an upload session and finalizes only an object whose size, hash and
media validation succeed.

### P5 simultaneous synchronization

1. Choose the reference angle and uninterrupted master audio.
2. Calculate coarse pairwise offsets from robust audio features.
3. Refine around candidate offsets with normalized correlation.
4. Compare offsets in multiple windows to estimate device drift.
5. Reject inconsistent pairwise results, calculate confidence and expose the
   report.
6. Allow manual offset/anchor correction; save it as a new project revision.

### P6 musical synchronization

1. Freeze the uploaded guide track and its reference timeline.
2. Analyze each audio/video take for count-in, onsets and musical features.
3. Propose bar/beat anchors and a monotonic mapping to the guide.
4. Distinguish small device clock error from performance divergence.
5. Report confidence/divergence and require manual anchors when evidence is
   insufficient.
6. Save mappings per source/take so audio and video selections remain
   independent.

Specialized DSP may run in Python behind a typed worker boundary, as allowed by
ADR 0001. The TypeScript application layer owns authorization, job lifecycle,
versioning and validation rather than embedding DSP rules in HTTP handlers.

### Preview

- The reference timeline is the playback clock. P5 monitors selected master
  audio; P6 monitors the current approved/draft AudioMix.
- Source tiles use lightweight proxies and do not decode every 4K original.
- The program monitor follows visual decisions; source monitoring never changes
  selected master audio or a P6 mix implicitly.
- Web creates cuts by number key or source-tile selection during playback, then
  permits boundary adjustment and angle replacement.
- P6 exposes separate Audio Mix and Video Program workspaces tied to the same
  reference playhead; selecting a visible performer never solos their audio.
- Mobile uses tap-to-switch and a compact program strip rather than reproducing
  a desktop multitrack layout.

### Final render

1. Freeze project revision, source hashes, sync maps, visual decisions, output
   profile and either P5 selected master audio or P6 approved AudioMix into a
   render input.
2. Normalize required source intervals to the output frame rate/resolution.
3. Apply synchronization mapping, framing and transitions.
4. Concatenate/composite the program video while preserving one continuous P5
   master audio or rendering the P6 multitrack mix independently.
5. Decode and validate duration, A/V synchronization, frame continuity, output
   profile and, for P6, loudness/true peak.
6. Store a versioned artifact and require explicit review/approval before a
   publication workflow uses it.

Retrying the same render input is idempotent and reuses the exact artifact. An
edit, synchronization or source change invalidates only dependent artifacts.

## API and MCP surface

The exact schemas are designed with the first vertical slice, but the capability
surface should remain project-oriented:

```text
POST/GET  /clip-projects
GET/PATCH /clip-projects/{clipProjectId}
POST      /clip-projects/{clipProjectId}/reference-track
POST      /clip-projects/{clipProjectId}/angles
GET       /clip-projects/{clipProjectId}/sources/{sourceId}/content-access
POST      /clip-projects/{clipProjectId}/performance-parts
POST      /clip-projects/{clipProjectId}/performance-parts/{partId}/takes
POST      /clip-projects/{clipProjectId}/sync-jobs
GET       /clip-projects/{clipProjectId}/sync-jobs/{jobId}
PUT       /clip-projects/{clipProjectId}/sync-map
PUT       /clip-projects/{clipProjectId}/audio-mix
PUT       /clip-projects/{clipProjectId}/visual-decisions
POST      /clip-projects/{clipProjectId}/previews
POST/GET  /clip-projects/{clipProjectId}/renders
GET       /clip-projects/{clipProjectId}/renders/{renderId}/content-access
```

MCP exposes the same application operations as tools and returns sync reports,
waveforms/markers, P5 visual decisions, P6 AudioMix/visual decisions and render
artifacts as typed data/resources. It does not imitate either visual editor.

## Product interfaces

### Web

The P5 Clip Studio workspace contains:

- import/session preparation plus reference-angle/master-audio state;
- source grid and program monitor;
- parallel angle lanes with waveforms and sync/confidence state;
- one continuous master-audio lane;
- one program/EDL lane;
- live switching through keys or source selection;
- cut-boundary adjustment, angle replacement, disable, trim and basic reframe;
- deterministic preview, render history, QA and approval.

P6 adds a session/parts view plus two separately saveable workspaces: Audio Mix
for selecting/mixing musician takes and Video Program for switching/compositing
video sources. Both share the reference playhead but neither changes the other
implicitly. Story scenes, story brief, collage tools and narration workflow do
not appear.

### Native Mobile

Keep one distributed application and add a product chooser with isolated Story
and Music Clip navigation trees. P5 Mobile must support the real operation set:
create/open a clip project, import/upload simultaneous angles, inspect sync
confidence, correct offset/anchors, tap-to-switch angles, preview and
request/approve export. P6 adds guide/part/take management, musical anchors,
compact per-track audio controls and independent video decisions. Its compact UI
does not need to copy desktop track geometry.

If audience and release cadence later justify another store application, the
Clip navigation tree can become `apps/clip-mobile` without changing APIs or
commercial access.

### MCP

MCP provides operational parity: create/read a project, attach sources, start
and inspect synchronization, read/update the visual decisions and P6 AudioMix,
start rendering and obtain the artifact. Visual interaction itself is `n/a`;
saved outcomes and rules are not.

## Pricing and resource policy

Music Clip Studio is an additional capability of the existing service, not an
independent product purchase. F18.7 covers the P5 multicamera capability and
F19.7 extends the same plan versions to P6 separate-performance capabilities.
They are complete only when:

- existing plan versions can grant clip capabilities without a new billing SKU;
- Web, Mobile and MCP enforce the same effective access;
- storage, takes/parts, audio processing and rendering use shared, visible typed
  limits;
- retries do not double-count committed usage;
- a user never encounters a second checkout merely for entering Clip Studio.

The product may initially be limited to an early-access cohort. A feature flag or
cohort assignment is not a separate tariff.

## Milestone P3 prelaunch slice

### F18.0 — public Clip Studio announcement and product chooser

After B16 has separated Site from the editors, add localized `/products` and
`/products/music-clips` pages. The chooser presents Story Studio as available
and Music Clip Studio as announced; the detail page distinguishes P5
simultaneous multicamera from P6 separate takes/parts and reads their estimated
months from the product roadmap source. The call to action may lead to the
roadmap or an honest product-information flow, but never to a fake upload or
editor. Preserve canonical/hreflang, sitemap, real `404` behavior, responsive
layout and the single pricing surface. Completing F18.0 does not complete F18.6
or any functional P5/P6 task.

## Milestone P5 delivery slices

### F18.1 — simultaneous multicamera project

Create, list and reopen a separate ClipProject restricted to one simultaneously
recorded performance. Select the reference angle and uninterrupted master audio;
persist authoritative duration and revision through Web, Mobile and MCP.

### F18.2 — angle ingest and presentation media

Upload several angles of the same event without changing originals; create
proxies, waveforms/analysis audio and timestamp metadata; expose progress,
validation and recoverable failures. Verify direct/resumable upload at realistic
sizes before completion.

### F18.3 — synchronization and correction

Produce offset/clock-drift mappings for the same acoustic event with confidence
and warnings; provide manual correction and refuse silent low-confidence
success. Different musical performances remain explicitly unavailable until P6.

### F18.4 — multicamera program edit

Switch angles during playback, store a valid non-overlapping EDL, adjust cuts and
reframe without rewriting sources. Master audio remains continuous. Web, Mobile
and MCP use different interaction forms but persist the same rules.

### F18.5 — preview, QA and export

Preview the exact program, create versioned renders, validate output and expose
an approved artifact. A stale render cannot be downloaded as the current result.

### F18.6 — public product presentation

Update the P3 prelaunch page and product chooser to a truthful P5 available
state, link to the working Clip Studio and show the verified multicamera path.
Keep P6 separate-performance editing marked as coming soon, preserve Story
Studio positioning and one public pricing surface. This task applies only to
Web.

### F18.7 — included access and shared limits

Grant and enforce clip capabilities through existing plan versions and shared
limits in Web, Mobile and MCP. No new Clip purchase or subscription is created.

## P5 completion criteria

P5 is complete when all applicable F18.1–F18.7 task/interface pairs are done and
a user can complete this verified path:

1. Enter Music Clip Studio with an existing account and plan.
2. Create a simultaneous multicamera project.
3. Upload several real angles of one performance without losing originals.
4. Choose the reference angle/master audio and review offset, clock drift,
   confidence and warnings; correct synchronization if necessary.
5. Switch angles during playback and refine a saved program track.
6. Preview and render a version whose uninterrupted master audio, cuts and
   framing match the approved edit.
7. Download or pass the approved artifact to the existing publication workflow.
8. Repeat the relevant operations from native Mobile and MCP with their own
   verified interfaces.

The following do not complete P5: an empty Clip route, reused Story scenes, a
waveform without saved synchronization, an API type without a working interface,
a flattened preview without editable decisions, a render that silently changes
master audio, or an unverified claim that different performances are aligned.

## Milestone P6 delivery slices

### F19.1 — guided separate-performance session

Extend ClipProject with a guide timeline, optional BPM/count-in, performers,
instruments and expected parts. One musician may submit several takes; audio and
video roles remain independent.

### F19.2 — isolated audio/video part ingest

Upload audio-only, video-only and combined recordings per part/take. Preserve
stable IDs, originals, proxies/waveforms, validation, progress and independent
replacement semantics.

### F19.3 — musical take/part alignment

Map every selected source to the guide using count-in, musical features and
manual bar/beat anchors. Store confidence/divergence and never hide material
performance retiming as device drift.

### F19.4 — independent multitrack audio mix

Select audio takes and save versioned trim/offset, mute, gain, pan, fades, basic
EQ/dynamics and master loudness/true-peak settings. Monitoring solo must not
silently alter export intent.

### F19.5 — independent video program

Select video takes by interval independently of the AudioMix; support cuts and a
basic multi-performer layout. Changing the visible performer must not switch,
mute or solo their audio.

### F19.6 — combined master QA/export

Bind the exact guide timeline, mappings, approved AudioMix, visual decisions,
layouts and output profile. Validate audio and video independently and together;
invalidate only dependent artifacts after an isolated change.

### F19.7 — included P6 access and shared limits

Grant parts/takes/audio-mix capabilities through existing plan versions and
shared typed usage. Do not create another tariff or checkout.

### F19.8 — public separate-recording positioning

Explain the P6 workflow on the localized Clip Studio page while distinguishing
it from available P5 multicamera behavior and preserving one pricing surface.

## P6 completion criteria

P6 is complete when all applicable F19 task/interface pairs are done and a user
can complete this verified path:

1. Create a guided session and define musicians/instruments/parts.
2. Collect several independent audio/video takes recorded at different times or
   places.
3. Review musical mappings to the guide and correct bar/beat anchors.
4. Choose audio takes and approve a reproducible multitrack AudioMix.
5. Independently choose video takes, cuts and basic ensemble layouts.
6. Preview and export a combined master whose audio mix does not follow visual
   camera switches.
7. Change only sound or only video and observe precise dependency invalidation.
8. Repeat the applicable operations from native Mobile and MCP without another
   purchase.

The following do not complete P6: reusing the P5 offset algorithm for different
performances, treating a combined phone recording as an inseparable audio/video
choice, gain-only playback without a saved AudioMix, hidden time-stretch, a
video switch that changes audio, or a flattened result without editable inputs.

## P5/P6 dependencies and explicit exclusions

Dependencies:

- B16 frontend boundaries;
- B13 effective access and ownership enforcement;
- F10.1 independent media archive or an equivalent clip-owned immutable source
  boundary before originals can be safely reused;
- F05.1 versioned dependencies and job/artifact hashing principles;
- F17 plan versions/billing lifecycle where shared paid limits are required.

P5 additionally depends on one verified simultaneous capture path and does not
require a guide track, musical DTW or multitrack audio mixing. P6 depends on the
P5 ClipProject/render foundation plus a user-provided guide track, musical
mapping, independent audio/video source roles and a versioned AudioMix.

Neither milestone depends on AI story assistance, AI cover generation or
generated music. AI angle selection, AI mix decisions, beat-aware cut
suggestions, advanced color/effects, real-time remote recording control and a
separate native store application are outside P5/P6 unless added as new stable
tasks.
