import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import {
  authenticationSchema, bearerSecurity, configureSceneSchema, createStorySchema, errorSchema, healthSchema,
  loginSchema, materialContentAccessSchema, platformCredentialSchema, platformParamsSchema, profileSchema, registerSchema, signInSchema,
  reorderSceneMaterialsSchema, setPlatformCredentialSchema, storySchema, storySummarySchema, updateProfileSchema,
} from "@storyteller/schemas";
import Fastify, { type FastifyRequest } from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { MediaStorage, MediaUploadError } from "./media-storage.js";

export async function buildApi(application: StoryApplication, options: { readonly mediaStorage?: MediaStorage } = {}) {
  const mediaStorage = options.mediaStorage ?? new MediaStorage();
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" })
    .setValidatorCompiler(validatorCompiler).setSerializerCompiler(serializerCompiler).withTypeProvider<ZodTypeProvider>();

  const configuredOrigins = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  await app.register(cors, {
    origin: configuredOrigins?.length ? configuredOrigins : true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(multipart, {
    limits: { files: 1, fields: 0, parts: 1, fileSize: Number(process.env.MAX_MEDIA_UPLOAD_BYTES ?? 500 * 1024 * 1024) },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "Storyteller API", version: "0.2.0" },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" } } },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error instanceof ApplicationError ? error.statusCode
      : typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    const logContext = { err: error, statusCode, method: request.method, url: request.url };
    if (statusCode >= 500) request.log.error(logContext, "request failed");
    else if (request.url.includes("/materials")) request.log.warn(logContext, "media request failed");
    void reply.status(statusCode).send({
      message: error instanceof Error ? error.message : "Unexpected error",
      ...(error instanceof ApplicationError && error.code ? { code: error.code } : {}),
    });
  });

  app.get("/health", { schema: { response: { 200: healthSchema } } }, async () => ({ status: "ok" as const }));
  app.post("/auth/register", {
    schema: { body: registerSchema, response: { 201: authenticationSchema, 409: errorSchema } },
  }, async (request, reply) => reply.status(201).send(await application.register(request.body)));
  app.post("/auth/login", {
    schema: { body: loginSchema, response: { 200: authenticationSchema, 401: errorSchema } },
  }, async (request) => application.login(request.body));
  app.post("/auth/sign-in", {
    schema: { body: signInSchema, response: { 200: authenticationSchema, 401: errorSchema, 409: errorSchema, 422: errorSchema } },
  }, async (request) => application.signIn({
    email: request.body.email, password: request.body.password,
    ...(request.body.name === undefined ? {} : { name: request.body.name }),
  }));

  app.get("/profile", {
    schema: { security: bearerSecurity, response: { 200: profileSchema, 401: errorSchema } },
  }, async (request) => authenticate(application, request));
  app.patch("/profile", {
    schema: { security: bearerSecurity, body: updateProfileSchema, response: { 200: profileSchema, 401: errorSchema } },
  }, async (request) => application.updateProfile((await authenticate(application, request)).id, request.body));

  app.get("/stories", {
    schema: { security: bearerSecurity, response: { 200: z.array(storySummarySchema), 401: errorSchema } },
  }, async (request) => [...await application.listStories((await authenticate(application, request)).id)]);
  app.post("/stories", {
    schema: { security: bearerSecurity, body: createStorySchema, response: { 201: storySummarySchema, 401: errorSchema } },
  }, async (request, reply) => reply.status(201).send(await application.createStory((await authenticate(application, request)).id, request.body)));
  const storyParams = z.object({ storyId: z.string().uuid() });
  app.get("/stories/:storyId", {
    schema: { security: bearerSecurity, params: storyParams, response: { 200: storySchema, 401: errorSchema, 404: errorSchema } },
  }, async (request) => serializeStory(await application.getStory((await authenticate(application, request)).id, request.params.storyId)));
  const sceneParams = storyParams.extend({ sceneId: z.string().uuid() });
  app.post("/stories/:storyId/scenes", {
    schema: { security: bearerSecurity, params: storyParams, response: { 201: storySchema, 401: errorSchema, 404: errorSchema } },
  }, async (request, reply) => reply.status(201).send(serializeStory(await application.createScene(
    (await authenticate(application, request)).id, request.params.storyId,
  ))));
  app.post("/stories/:storyId/scenes/:sceneId/materials", {
    schema: { security: bearerSecurity, params: sceneParams, response: { 201: storySchema, 401: errorSchema, 404: errorSchema, 413: errorSchema, 415: errorSchema, 422: errorSchema } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    if (!story.scenes.some(({ id }) => id === request.params.sceneId)) throw new ApplicationError(`scene not found: ${request.params.sceneId}`, 404);
    const upload = await request.file();
    if (!upload) throw new MediaUploadError("media file is required", 422);
    const stored = await mediaStorage.store(upload, { profileId: profile.id, storyId: story.id, sceneId: request.params.sceneId });
    try {
      return reply.status(201).send(serializeStory(await application.addSceneMaterial(
        profile.id, story.id, request.params.sceneId, stored.material,
      )));
    } catch (error) {
      try {
        await stored.cleanup();
      } catch (cleanupError) {
        request.log.error({ err: cleanupError, storageKey: stored.material.storageKey }, "could not roll back stored media");
      }
      throw error;
    }
  });
  const materialParams = storyParams.extend({ materialId: z.string().uuid() });
  const sceneMaterialParams = sceneParams.extend({ materialId: z.string().uuid() });
  app.delete("/stories/:storyId/scenes/:sceneId/materials/:materialId", {
    schema: { security: bearerSecurity, params: sceneMaterialParams, response: { 200: storySchema, 401: errorSchema, 404: errorSchema } },
  }, async (request) => {
    const profile = await authenticate(application, request);
    const removed = await application.removeSceneMaterial(
      profile.id, request.params.storyId, request.params.sceneId, request.params.materialId,
    );
    try {
      await mediaStorage.delete(removed.material.storageKey);
    } catch (error) {
      request.log.error({ err: error, storageKey: removed.material.storageKey }, "could not delete removed material from object storage");
    }
    return serializeStory(removed.story);
  });
  app.get("/stories/:storyId/materials/:materialId/content", {
    schema: { security: bearerSecurity, params: materialParams },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const direct = await mediaStorage.createDownloadUrl(material.storageKey);
    if (direct) return reply.header("cache-control", "private, no-store").redirect(direct.url);
    return reply.type(material.mimeType).header("cache-control", "private, max-age=3600").send(await mediaStorage.open(material.storageKey));
  });
  app.get("/stories/:storyId/materials/:materialId/content-access", {
    schema: { security: bearerSecurity, params: materialParams, response: { 200: materialContentAccessSchema, 401: errorSchema, 404: errorSchema } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const direct = await mediaStorage.createDownloadUrl(material.storageKey);
    reply.header("cache-control", "private, no-store");
    return direct
      ? { url: direct.url, expiresAt: direct.expiresAt.toISOString() }
      : { url: null };
  });
  app.put("/stories/:storyId/scenes/:sceneId/material-order", {
    schema: { security: bearerSecurity, params: sceneParams, body: reorderSceneMaterialsSchema, response: { 200: storySchema, 401: errorSchema, 404: errorSchema } },
  }, async (request) => serializeStory(await application.reorderSceneMaterials(
    (await authenticate(application, request)).id, request.params.storyId, request.params.sceneId, request.body.materialIds,
  )));
  app.patch("/stories/:storyId/scenes/:sceneId", {
    schema: { security: bearerSecurity, params: sceneParams, body: configureSceneSchema, response: { 200: storySchema, 401: errorSchema, 404: errorSchema } },
  }, async (request) => serializeStory(await application.configureScene(
    (await authenticate(application, request)).id, request.params.storyId, request.params.sceneId, {
      ...(request.body.durationSeconds === undefined ? {} : { durationSeconds: request.body.durationSeconds }),
      ...(request.body.layoutId === undefined ? {} : { layoutId: request.body.layoutId }),
      ...(request.body.motion === undefined ? {} : { motion: request.body.motion }),
      ...(request.body.focusPoint === undefined ? {} : { focusPoint: request.body.focusPoint }),
    },
  )));

  app.get("/profile/platform-credentials", {
    schema: { security: bearerSecurity, response: { 200: z.array(platformCredentialSchema), 401: errorSchema } },
  }, async (request) => [...await application.listPlatformCredentials((await authenticate(application, request)).id)]);
  app.put("/profile/platform-credentials/:provider", {
    schema: { security: bearerSecurity, params: platformParamsSchema, body: setPlatformCredentialSchema, response: { 200: platformCredentialSchema, 401: errorSchema } },
  }, async (request) => application.setPlatformCredential((await authenticate(application, request)).id, {
    provider: request.params.provider, secret: request.body.secret,
    ...(request.body.externalAccountId === undefined ? {} : { externalAccountId: request.body.externalAccountId }),
  }));
  app.delete("/profile/platform-credentials/:provider", {
    schema: { security: bearerSecurity, params: platformParamsSchema, response: { 204: z.null(), 401: errorSchema, 404: errorSchema } },
  }, async (request, reply) => {
    await application.deletePlatformCredential((await authenticate(application, request)).id, request.params.provider);
    return reply.status(204).send(null);
  });

  return app;
}

async function authenticate(application: StoryApplication, request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new ApplicationError("authentication required", 401);
  return application.authenticate(authorization.slice(7).trim());
}

function serializeStory(story: unknown) {
  // Parse readonly domain collections into the mutable public JSON response shape.
  return storySchema.parse(story);
}
