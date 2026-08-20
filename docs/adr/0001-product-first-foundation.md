# ADR 0001: Product-first foundation

## Status

Accepted

## Decision

Design the story workflow for web and mobile rather than copying the chatbot workflow from `hermes-story-skills`.

The first domain lifecycle is deliberately small:

```text
draft -> rendering -> ready -> publishing -> published
```

Content edits to a ready story create a new draft revision. API and MCP will call the same application services. Renderers and publishers are ports with no concrete adapters in the foundation.

## Consequences

- Existing skills and Python scripts remain untouched.
- Legacy manifests and approval flows are not dependencies of the new product.
- Renderer migration decisions can be made one at a time from actual UI needs.
- Specialized CV, audio and ML implementations may remain Python.
