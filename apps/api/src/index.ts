import { buildApi } from "./server.js";
import { StoryApplication } from "@storyteller/application";
import { createPostgresRepository } from "./database.js";
import { loadLocalEnvironment } from "./environment.js";
import { migrateDatabase } from "./migrations.js";
import { MediaStorage } from "./media-storage.js";
import { PostgresSceneRenderQueue } from "@storyteller/render-queue";
import { createConfiguredObjectStorage } from "@storyteller/storage";
import { AccessControlService } from "@storyteller/application";
import { PostgresAccessRepository } from "./access-control-database.js";
import { AdminReadModel } from "./admin-database.js";

loadLocalEnvironment();
const { pool, repository } = createPostgresRepository();
await migrateDatabase(pool);
const objectStorage = createConfiguredObjectStorage();
const api = await buildApi(new StoryApplication(repository), {
  mediaStorage: new MediaStorage(objectStorage),
  objectStorage,
  renderQueue: new PostgresSceneRenderQueue(pool),
  accessControl: new AccessControlService(new PostgresAccessRepository(pool)),
  adminReadModel: new AdminReadModel(pool),
});

api.addHook("onClose", async () => pool.end());

await api.listen({
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
});
