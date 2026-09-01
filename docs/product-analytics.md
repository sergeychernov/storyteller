# Product analytics

Storyteller uses one Amplitude project for the public Site, Story Studio and the
planned Clip Studio. Native Mobile and MCP keep independent product-roadmap
statuses and will add the same outcome events when those interfaces are built.

## Configuration

The browser integration is disabled when `VITE_AMPLITUDE_API_KEY` is empty. The
Browser SDK sends to the first-party API relay at
`<VITE_API_URL>/analytics/amplitude`; the browser does not contact an Amplitude
ingestion domain directly. Set the browser variables in the root `.env.local`
for local verification and on the Railway `web` service for a production build:

```dotenv
VITE_AMPLITUDE_API_KEY=<browser project API key>
VITE_AMPLITUDE_SERVER_ZONE=US
```

Set the matching server variables on the Railway `api` service:

```dotenv
AMPLITUDE_API_KEY=<same project API key>
AMPLITUDE_SERVER_ZONE=US
```

For local development the API also loads the repository-root `.env.local` and,
when no explicit server value exists, reuses the matching browser-safe project
key and zone. This keeps the first-party relay and the Vite bundle in sync
without duplicating the same local value. Explicit `AMPLITUDE_*` values always
take precedence.

The server zone must match the Amplitude organization. Use `EU` for an EU data
region and `US` for a default US organization. The project API key is designed
to be embedded in a browser bundle, but the relay requires the browser and API
values to match so environments cannot write to a different configured project.

All three Vite applications load the repository-root environment. A missing
browser key is an intentional no-op. A missing API key leaves the relay route at
HTTP 503, so tests, local development and preview builds do not send accidental
events. The relay forwards only to the fixed Amplitude HTTP V2 endpoint for the
configured region. It accepts batches of documented event types, strips SDK
metadata outside its allowlist, and rejects any extra event property.

## Privacy boundary

- Identify an authenticated person only by the stable `profile.id`.
- Never send email, display name, story/scene/material IDs, titles, filenames,
  free-form text, media URLs or API errors.
- Amplitude element/form/file autocapture, remote configuration and IP address
  enrichment are disabled.
- Session replay is not installed. In particular, the authenticated editors do
  not record personal photos, videos, text or signed media URLs.
- The first-party relay does not forward client-supplied IP or arbitrary user
  properties. Its fixed destination and typed property allowlist prevent it
  from becoming a general-purpose proxy.
- Logout resets Amplitude identity. A missing or expired application session
  clears the Amplitude user ID before another page event is recorded.

## Event taxonomy

Event names follow the `object verb` form and are compile-time checked by
`@storyteller/analytics`.

| Event | Properties | Recorded after |
| --- | --- | --- |
| `page viewed` | `surface`, `page` | A safe logical route without resource IDs is shown |
| `account created` | `surface` | Registration succeeds |
| `account signed in` | `surface` | Sign-in succeeds |
| `profile language changed` | `surface`, `language` | The authenticated profile API confirms a supported language |
| `story created` | `surface` | The API returns the created story |
| `scene created` | `surface` | The API returns the updated story |
| `material uploaded` | `surface`, `material_kind` | Each image/video upload succeeds |
| `collage background configured` | `surface`, `collage_background_mode` | The dedicated background API confirms a custom upload or restoration of the previous-scene frame |
| `collage row direction configured` | `surface`, `collage_row_direction` | The scene configuration API confirms the ascending, level, descending, or irregular card alignment |
| `timeline edited` | `surface`, `timeline_edit_kind` | The scene-order or cross-scene material-move API confirms the edit |
| `scene render requested` | `surface`, `export_mode`, `renderer_kind`, `collage_card_orientation`, `collage_media_mix` | The API accepts the render request |
| `scene render succeeded` | `surface`, `export_mode`, `renderer_kind`, `collage_card_orientation`, `collage_media_mix` | Polling reads the ready render |
| `scene exported` | `surface`, `export_mode`, `renderer_kind`, `collage_card_orientation`, `collage_media_mix` | The browser receives the artifact and starts saving it |
| `scene export failed` | `surface`, `export_mode`, `renderer_kind`, `collage_card_orientation`, `collage_media_mix`, `failure_stage`, `failure_reason` | A safe error category is known |

Authentication events are flushed before the Site navigates into another
frontend bundle. A failed analytics request never prevents the authenticated
session from continuing. The API returns the authoritative `accountCreated`
result; the client never infers registration from whether the name field was
shown or submitted.

`profile language changed` is emitted only after `PATCH /profile` succeeds. Its
`language` property is restricted to the supported locale identifiers and never
contains profile text, email or another user-supplied value.

The current Web activation event is `scene render succeeded`. It is deliberately
not named `story exported`: full-story master assembly belongs to F04 and is not
implemented yet. Publication events should be added only with the corresponding
real adapters and verified results.

`renderer_kind` is a privacy-safe category (`still_image`, `video`, or `collage`)
that makes the confirmed F03.1 collage outcome measurable without sending scene,
material, title, filename, or layout identifiers.
`collage_card_orientation` distinguishes the confirmed `angled` and `straight`
collage outcomes; non-collage renderers send `not_applicable`. It never contains
individual angles or other scene data.
`collage_media_mix` distinguishes `images_only` from `includes_video` for the
confirmed collage outcome; non-collage renderers send `not_applicable`. It does
not expose counts, order, filenames, IDs, or content.
`collage_background_mode` distinguishes `previous_scene_darkened` from
`custom_material_original`. It is emitted only after the dedicated background
operation succeeds and never exposes the material kind, ID, filename, or content.
`timeline_edit_kind` is restricted to `scene_reordered` or
`material_moved_between_scenes`. The event is emitted only after the API returns
the updated story; optimistic movement, failed requests and revision conflicts do
not emit it. Scene, material and story identifiers are never included.

### B13 access-control instrumentation decision

B13 does not add an Amplitude event for access resolution, an allowed check or a
denial. Those checks are security decisions rather than confirmed user outcomes.
Existing product events continue to be emitted only after the protected operation
succeeds. Effective-access explanations, denial reasons, plan/cohort/role
assignments and capability codes are kept out of the external analytics stream;
their operational history belongs to the access audit trail and the future B14
read-only admin interface.

### B14 Admin instrumentation decision

B14 does not add an external Amplitude event. Reading an internal dashboard,
user metadata, activity, sessions, effective access, or audit history is an
administrative security operation rather than a confirmed customer product
outcome. These reads are recorded in the internal fail-closed `admin_audit_log`
without email, query text, IP address, user-agent, response content, or raw
errors. The separate 90-day `product_activity_events` read model uses only
stable outcome codes and profile UUIDs; it is not forwarded to Amplitude and has
no free-form payload. Existing public product analytics and their privacy
defaults remain unchanged.

### Issue #16 Admin access-management instrumentation decision

Issue #16 does not add an external Amplitude event. Assigning roles or cohorts,
creating capability or limit overrides, previewing effective access, and revoking
a session are internal administrative security operations rather than confirmed
customer product outcomes. Successful mutations are recorded in immutable access
or admin audit with actor UUID, target UUID, a required internal reason, batch UUID
and a typed before/after change. None of those values, capability codes, reasons or
access explanations are forwarded to Amplitude. Existing product events continue
to be emitted only after their protected customer operation succeeds.

The read-only access guide and its inline descriptions also add no Amplitude
event: reading reference text has no independently confirmed product outcome and
does not change access. Catalog visibility remains capability-gated, while actual
access mutations continue to be measured by immutable internal audit.

## First Amplitude dashboard

Keep the first dashboard small:

1. Unique users for `page viewed`, grouped by `surface`, over 7 and 30 days.
2. Funnel within one day: `account created` → `story created` →
   `material uploaded` → `scene render succeeded`.
3. Median time from `account created` to `scene render succeeded`.
4. Weekly retention where the starting event is `scene render succeeded` and
   the return event is any Story Studio product event.
5. `scene export failed` grouped by `failure_stage` and `failure_reason` next to
   the successful export count.

Before marking Web B17 done, deploy all four variables, perform one isolated test
journey and verify the exact events, user merge and property values in Amplitude
Live Events. Do not use a real publication as an analytics test.
