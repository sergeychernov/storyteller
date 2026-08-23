import { buildApi } from "./server.js";
import { StoryApplication } from "@storyteller/application";
import { createPostgresRepository } from "./database.js";
import { loadLocalEnvironment } from "./environment.js";
import { migrateDatabase } from "./migrations.js";

loadLocalEnvironment();
const { pool, repository } = createPostgresRepository();
await migrateDatabase(pool);
const api = await buildApi(new StoryApplication(repository));

api.addHook("onClose", async () => pool.end());

await api.listen({
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
});
