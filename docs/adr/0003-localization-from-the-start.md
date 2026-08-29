# ADR 0003: Localization from the start

## Status

Accepted.

## Decision

- Keep product copy in `packages/localization`, shared by web and mobile.
- Support English (`en`), Russian (`ru`), Serbian Latin (`sr-Latn`), and Spanish (`es`).
- Fall back to English for unsupported system locales.
- Use the system locale on first launch and persist an explicit anonymous choice locally.
- Persist the authenticated profile language through the API. In Web app routes the profile is authoritative; changing a header selector updates the profile before changing the interface. Public localized URLs remain authoritative for anonymous navigation, while an authenticated header change updates both the profile and URL.
- Keep translation keys stable and typed; UI components must not introduce new user-facing hard-coded strings.
- Localize in clients. Backend and domain errors should evolve toward stable machine-readable codes rather than selecting a human language in API handlers.

## Rationale

Localization affects copy length, plural rules, navigation, errors, accessibility labels, and persistence. Establishing the boundary before the editor grows avoids extracting strings from large components later.

Serbian Latin is the initial Serbian script because one Serbian variant is enough for the MVP. Serbian Cyrillic can be added later as a separate locale without changing the translation API.

## Consequences

- Web and mobile share the same dictionary and pluralization behavior.
- Web stores an anonymous locale in browser storage and synchronizes authenticated Site, Story Studio and Clip Studio sessions with the profile. Mobile still stores its B01 choice in Async Storage until Mobile B12 is implemented.
- Adding a translation key requires values for all four locales at compile time.
