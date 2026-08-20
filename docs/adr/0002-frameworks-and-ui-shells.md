# ADR 0002: Fastify backend and minimal React UI shells

## Status

Accepted for the MVP foundation.

## Decision

- Use Fastify 5 for the HTTP API.
- Use Zod schemas as runtime validation and OpenAPI input.
- Keep use cases in `packages/application`, outside the HTTP transport, so MCP can call the same code as an equal interface.
- Use React with Vite for the web studio.
- Use Expo Router for the mobile companion.
- Keep persistence in memory for the first UI flow.

## Rationale

Fastify gives the backend a small explicit core, good TypeScript support, and a direct path to generated API documentation. React/Vite keeps the web editor flexible, while Expo Router gives the mobile shell native navigation without creating a second product architecture.

The product workflow is still being designed through the UI. Choosing a database or moving renderer implementations now would create constraints before the scene editor and timeline have proved their shape.

## Consequences

- `yarn dev` starts a visible web product and its API.
- Restarting the API clears the development data.
- Worker, MCP, renderer adapters, publishing adapters, and persistence remain deliberately thin until their first real vertical slice.
