# ADR 0003: Localization from the start

## Status

Accepted.

## Decision

- Keep product copy in `packages/localization`, shared by web and mobile.
- Start with English (`en`), Russian (`ru`), and Serbian Latin (`sr-Latn`).
- Fall back to English for unsupported system locales.
- Use the system locale on first launch and persist an explicit user choice locally.
- Keep translation keys stable and typed; UI components must not introduce new user-facing hard-coded strings.
- Localize in clients. Backend and domain errors should evolve toward stable machine-readable codes rather than selecting a human language in API handlers.

## Rationale

Localization affects copy length, plural rules, navigation, errors, accessibility labels, and persistence. Establishing the boundary before the editor grows avoids extracting strings from large components later.

Serbian Latin is the initial Serbian script because one Serbian variant is enough for the MVP. Serbian Cyrillic can be added later as a separate locale without changing the translation API.

## Consequences

- Web and mobile share the same dictionary and pluralization behavior.
- Web stores the locale in browser storage; mobile stores it in Async Storage.
- Adding a translation key requires values for all three locales at compile time.
