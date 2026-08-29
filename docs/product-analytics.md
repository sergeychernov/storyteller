# Product analytics

Storyteller uses one Amplitude project for the public Site, Story Studio and the
planned Clip Studio. Native Mobile and MCP keep independent product-roadmap
statuses and will add the same outcome events when those interfaces are built.

## Configuration

The browser integration is disabled when `VITE_AMPLITUDE_API_KEY` is empty. Set
both variables in the root `.env.local` for local verification and on the
Railway `web` service for a production build:

```dotenv
VITE_AMPLITUDE_API_KEY=<browser project API key>
VITE_AMPLITUDE_SERVER_ZONE=US
```

The server zone must match the Amplitude organization. Use `EU` for an EU data
region and `US` for a default US organization. The API key is designed to be
embedded in a browser bundle, but it still belongs in deployment configuration
so environments can use different Amplitude projects.

All three Vite applications load the repository-root environment. A missing key
is an intentional no-op, so tests, local development and preview builds do not
send accidental events.

## Privacy boundary

- Identify an authenticated person only by the stable `profile.id`.
- Never send email, display name, story/scene/material IDs, titles, filenames,
  free-form text, media URLs or API errors.
- Amplitude element/form/file autocapture, remote configuration and IP address
  enrichment are disabled.
- Session replay is not installed. In particular, the authenticated editors do
  not record personal photos, videos, text or signed media URLs.
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
| `story created` | `surface` | The API returns the created story |
| `scene created` | `surface` | The API returns the updated story |
| `material uploaded` | `surface`, `material_kind` | Each image/video upload succeeds |
| `scene render requested` | `surface`, `export_mode` | The API accepts the render request |
| `scene render succeeded` | `surface`, `export_mode` | Polling reads the ready render |
| `scene exported` | `surface`, `export_mode` | The browser receives the artifact and starts saving it |
| `scene export failed` | `surface`, `export_mode`, `failure_stage`, `failure_reason` | A safe error category is known |

Authentication events are flushed before the Site navigates into another
frontend bundle. A failed analytics request never prevents the authenticated
session from continuing. The API returns the authoritative `accountCreated`
result; the client never infers registration from whether the name field was
shown or submitted.

The current Web activation event is `scene render succeeded`. It is deliberately
not named `story exported`: full-story master assembly belongs to F04 and is not
implemented yet. Publication events should be added only with the corresponding
real adapters and verified results.

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

Before marking Web B17 done, deploy the two variables, perform one isolated test
journey and verify the exact events, user merge and property values in Amplitude
Live Events. Do not use a real publication as an analytics test.
