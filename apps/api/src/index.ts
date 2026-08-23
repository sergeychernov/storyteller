import { buildApi } from "./server.js";

const api = await buildApi();

await api.listen({
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
});
