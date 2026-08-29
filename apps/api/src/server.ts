import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ApplicationError, createBaselineAccessControl, type AccessControlService, type StoryApplication } from "@storyteller/application";
import { getMaterialPresentation, getMaterialSource, materialStorageKeys, type MaterialEdit } from "@storyteller/domain";
import { sceneRenderFileType, type SceneRenderQueue } from "@storyteller/render-queue";
import {
  authenticationSchema, bearerSecurity, configureSceneSchema, createStorySchema, deleteSceneSchema, editMaterialSchema, errorSchema, healthSchema,
  loginSchema, materialContentAccessSchema, materialWaveformSchema, platformCredentialSchema, platformParamsSchema, profileSchema, registerSchema, signInSchema,
  reorderSceneMaterialsSchema, sceneFrameSchema, sceneRenderRequestSchema, sceneRenderSchema, setPlatformCredentialSchema, storySchema, storySummarySchema, updateProfileSchema,
} from "@storyteller/schemas";
import type { ObjectStorage } from "@storyteller/storage";
import Fastify, { type FastifyRequest } from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { MediaStorage, MediaUploadError } from "./media-storage.js";
import { SceneRenderService, serializeSceneRender } from "./scene-renders.js";
import { authenticate } from "./authentication.js";
import { registerStoryTimelineRoutes } from "./story-timeline-routes.js";
import { registerAmplitudeRelayRoutes, type AmplitudeRelayOptions } from "./amplitude-relay.js";
import { accessPolicyForRoute, registerAccessControl } from "./access-control.js";

export async function buildApi(application: StoryApplication, options: {
  readonly mediaStorage?: MediaStorage;
  readonly objectStorage?: ObjectStorage;
  readonly renderQueue?: SceneRenderQueue;
  readonly amplitudeRelay?: AmplitudeRelayOptions;
  readonly accessControl?: AccessControlService;
} = {}) {
  const mediaStorage = options.mediaStorage ?? new MediaStorage();
  const renderService = options.renderQueue && new SceneRenderService(application, options.renderQueue, mediaStorage);
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" })
    .setValidatorCompiler(validatorCompiler).setSerializerCompiler(serializerCompiler).withTypeProvider<ZodTypeProvider>();
  const accessControl = options.accessControl ?? createBaselineAccessControl();

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
    transformObject: (document) => {
      if (!("openapiObject" in document)) return document.swaggerObject;
      // Swagger assumes every body schema is required, but this route also accepts bodyless DELETEs.
      const body = document.openapiObject.paths?.["/stories/{storyId}/scenes/{sceneId}"]?.delete?.requestBody;
      if (body && "content" in body) body.required = false;
      for (const [path, pathItem] of Object.entries(document.openapiObject.paths ?? {})) {
        for (const method of ["get", "post", "put", "patch", "delete"] as const) {
          const operation = pathItem?.[method];
          if (!operation?.security?.length) continue;
          const routeUrl = path.replaceAll(/\{([^}]+)\}/g, ":$1");
          const policy = accessPolicyForRoute(method.toUpperCase(), routeUrl);
          if (policy && policy !== "authenticated") {
            operation.responses[403] ??= {
              description: "The authenticated profile does not have the required capability.",
              content: { "application/json": { schema: { type: "object", required: ["message"], properties: {
                message: { type: "string" }, code: { type: "string" },
              } } } },
            };
          }
        }
      }
      return document.openapiObject;
    },
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
  registerAmplitudeRelayRoutes(app, options.amplitudeRelay);
  registerAccessControl(app, application, accessControl);
  app.post("/auth/register", {
    schema: { body: registerSchema, response: { 201: authenticationSchema, 409: errorSchema } },
  }, async (request, reply) => reply.status(201).send(await application.register({
    name: request.body.name, email: request.body.email, password: request.body.password,
    ...(request.body.language === undefined ? {} : { language: request.body.language }),
  })));
  app.post("/auth/login", {
    schema: { body: loginSchema, response: { 200: authenticationSchema, 401: errorSchema } },
  }, async (request) => application.login(request.body));
  app.post("/auth/sign-in", {
    schema: { body: signInSchema, response: { 200: authenticationSchema, 401: errorSchema, 409: errorSchema, 422: errorSchema } },
  }, async (request) => application.signIn({
    email: request.body.email, password: request.body.password,
    ...(request.body.name === undefined ? {} : { name: request.body.name }),
    ...(request.body.language === undefined ? {} : { language: request.body.language }),
  }));

  app.get("/profile", {
    schema: { security: bearerSecurity, response: { 200: profileSchema, 401: errorSchema } },
  }, async (request) => authenticate(application, request));
  app.patch("/profile", {
    schema: { security: bearerSecurity, body: updateProfileSchema, response: { 200: profileSchema, 401: errorSchema } },
  }, async (request) => application.updateProfile((await authenticate(application, request)).id, {
    ...(request.body.name === undefined ? {} : { name: request.body.name }),
    ...(request.body.language === undefined ? {} : { language: request.body.language }),
  }));

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
  registerStoryTimelineRoutes(app, application);
  const sceneParams = storyParams.extend({ sceneId: z.string().uuid() });
  app.post("/stories/:storyId/scenes", {
    schema: { security: bearerSecurity, params: storyParams, response: { 201: storySchema, 401: errorSchema, 404: errorSchema, 409: errorSchema } },
  }, async (request, reply) => reply.status(201).send(serializeStory(await application.createScene(
    (await authenticate(application, request)).id, request.params.storyId,
  ))));
  app.delete("/stories/:storyId/scenes/:sceneId", {
    schema: {
      operationId: "deleteScene", summary: "Delete a scene",
      description: "Permanently removes the scene and its anchored narrations, and returns the updated story. "
        + "Scene renders and material files not referenced by another scene in this story are queued for deletion. "
        + "An optional expectedRevision guards against deleting from a stale editor. Missing scenes return 404, including repeated deletes.",
      security: bearerSecurity, params: sceneParams, body: deleteSceneSchema.nullish(),
      response: { 200: storySchema, 400: errorSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema },
    },
  }, async (request, reply) => reply.header("cache-control", "private, no-store").send(serializeStory(await application.deleteScene(
    (await authenticate(application, request)).id, request.params.storyId, request.params.sceneId, request.body?.expectedRevision,
  ))));
  app.post("/stories/:storyId/scenes/:sceneId/materials", {
    schema: { security: bearerSecurity, params: sceneParams, response: { 201: storySchema, 401: errorSchema, 404: errorSchema, 409: errorSchema, 413: errorSchema, 415: errorSchema, 422: errorSchema } },
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
    schema: { security: bearerSecurity, params: sceneMaterialParams, response: { 200: storySchema, 401: errorSchema, 404: errorSchema, 409: errorSchema } },
  }, async (request) => {
    const profile = await authenticate(application, request);
    const removed = await application.removeSceneMaterial(
      profile.id, request.params.storyId, request.params.sceneId, request.params.materialId,
    );
    for (const storageKey of materialStorageKeys(removed.material)) {
      await deleteStoredObject(mediaStorage, storageKey, request, options.renderQueue);
    }
    return serializeStory(removed.story);
  });
  app.patch("/stories/:storyId/scenes/:sceneId/materials/:materialId", {
    schema: {
      security: bearerSecurity, params: sceneMaterialParams, body: editMaterialSchema,
      response: { 200: storySchema, 401: errorSchema, 404: errorSchema, 409: errorSchema, 422: errorSchema, 503: errorSchema },
    },
  }, async (request) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const scene = story.scenes.find(({ id }) => id === request.params.sceneId);
    if (!scene) throw new ApplicationError(`scene not found: ${request.params.sceneId}`, 404);
    const material = scene.materials.find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const edit: MaterialEdit = {
      rotation: request.body.rotation, crop: request.body.crop,
      ...(request.body.trim ? { trim: request.body.trim } : {}),
    };
    const oldIntermediateKey = material.edit?.result?.storageKey;
    if (material.kind === "video") {
      await mediaStorage.validateVideoEdit(material, edit);
      const { edit: _oldEdit, ...original } = material;
      const changed = await application.replaceSceneMaterial(profile.id, story.id, scene.id,
        isIdentityEdit(edit) ? original : { ...original, edit });
      if (oldIntermediateKey && !materialStorageKeys(original).includes(oldIntermediateKey)) {
        await deleteStoredObject(mediaStorage, oldIntermediateKey, request, options.renderQueue);
      }
      return serializeStory(changed);
    }
    if (isIdentityEdit(edit)) {
      const { edit: _oldEdit, ...original } = material;
      const changed = await application.replaceSceneMaterial(profile.id, story.id, scene.id, original);
      if (oldIntermediateKey) await deleteStoredObject(mediaStorage, oldIntermediateKey, request, options.renderQueue);
      return serializeStory(changed);
    }
    const stored = await mediaStorage.edit(material, edit, {
      profileId: profile.id, storyId: story.id, sceneId: scene.id,
    });
    try {
      const changed = await application.replaceSceneMaterial(profile.id, story.id, scene.id, {
        ...material,
        edit: { ...edit, result: stored.result },
      });
      if (oldIntermediateKey && oldIntermediateKey !== stored.result.storageKey) {
        await deleteStoredObject(mediaStorage, oldIntermediateKey, request, options.renderQueue);
      }
      return serializeStory(changed);
    } catch (error) {
      await deleteStoredObject(mediaStorage, stored.result.storageKey, request, options.renderQueue);
      throw error;
    }
  });
  app.get("/stories/:storyId/materials/:materialId/content", {
    schema: { security: bearerSecurity, params: materialParams },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const presentation = getMaterialPresentation(material);
    const direct = await mediaStorage.createDownloadUrl(presentation.storageKey);
    if (direct) return reply.header("cache-control", "private, no-store").redirect(direct.url);
    return reply.type(presentation.mimeType).header("cache-control", "private, no-store").send(await mediaStorage.open(presentation.storageKey));
  });
  app.get("/stories/:storyId/materials/:materialId/content-access", {
    schema: { security: bearerSecurity, params: materialParams, response: { 200: materialContentAccessSchema, 401: errorSchema, 404: errorSchema } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const direct = await mediaStorage.createDownloadUrl(getMaterialPresentation(material).storageKey);
    reply.header("cache-control", "private, no-store");
    return direct
      ? { url: direct.url, expiresAt: direct.expiresAt.toISOString() }
      : { url: null };
  });
  app.get("/stories/:storyId/materials/:materialId/waveform", {
    schema: { security: bearerSecurity, params: materialParams, response: { 200: materialWaveformSchema, 401: errorSchema, 404: errorSchema, 422: errorSchema } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const peaks = await mediaStorage.waveform(material);
    return reply.header("cache-control", "private, no-store").send({ peaks });
  });
  app.get("/stories/:storyId/materials/:materialId/source-content", {
    schema: { security: bearerSecurity, params: materialParams },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const source = getMaterialSource(material);
    const direct = await mediaStorage.createDownloadUrl(source.storageKey);
    if (direct) return reply.header("cache-control", "private, no-store").redirect(direct.url);
    return reply.type(source.mimeType).header("cache-control", "private, no-store").send(await mediaStorage.open(source.storageKey));
  });
  app.get("/stories/:storyId/materials/:materialId/source-content-access", {
    schema: { security: bearerSecurity, params: materialParams, response: { 200: materialContentAccessSchema, 401: errorSchema, 404: errorSchema } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const story = await application.getStory(profile.id, request.params.storyId);
    const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
    if (!material) throw new ApplicationError(`material not found: ${request.params.materialId}`, 404);
    const direct = await mediaStorage.createDownloadUrl(getMaterialSource(material).storageKey);
    reply.header("cache-control", "private, no-store");
    return direct ? { url: direct.url, expiresAt: direct.expiresAt.toISOString() } : { url: null };
  });
  for (const accessOnly of [false, true]) {
    app.get(`/stories/:storyId/materials/:materialId/audio-content${accessOnly ? "-access" : ""}`, {
      schema: { security: bearerSecurity, params: materialParams },
    }, async (request, reply) => {
      const profile = await authenticate(application, request);
      const story = await application.getStory(profile.id, request.params.storyId);
      const material = story.scenes.flatMap(({ materials }) => materials).find(({ id }) => id === request.params.materialId);
      if (material?.kind !== "video" || !material.audioTrack) throw new ApplicationError("audio track not found", 404);
      const track = material.audioTrack;
      const direct = await mediaStorage.createDownloadUrl(track.storageKey);
      reply.header("cache-control", "private, no-store");
      if (accessOnly) return direct ? { url: direct.url, expiresAt: direct.expiresAt.toISOString() } : { url: null };
      if (direct) return reply.redirect(direct.url);
      return reply.type(track.mimeType).send(await mediaStorage.open(track.storageKey));
    });
  }
  app.put("/stories/:storyId/scenes/:sceneId/material-order", {
    schema: { security: bearerSecurity, params: sceneParams, body: reorderSceneMaterialsSchema, response: { 200: storySchema, 401: errorSchema, 404: errorSchema, 409: errorSchema } },
  }, async (request) => serializeStory(await application.reorderSceneMaterials(
    (await authenticate(application, request)).id, request.params.storyId, request.params.sceneId, request.body.materialIds,
  )));
  app.patch("/stories/:storyId/scenes/:sceneId", {
    schema: { security: bearerSecurity, params: sceneParams, body: configureSceneSchema, response: { 200: storySchema, 401: errorSchema, 404: errorSchema, 409: errorSchema } },
  }, async (request) => serializeStory(await application.configureScene(
    (await authenticate(application, request)).id, request.params.storyId, request.params.sceneId, {
      ...(request.body.durationSeconds === undefined ? {} : { durationSeconds: request.body.durationSeconds }),
      ...(request.body.layoutId === undefined ? {} : { layoutId: request.body.layoutId }),
      ...(request.body.motion === undefined ? {} : { motion: request.body.motion }),
      ...(request.body.focusPoint === undefined ? {} : { focusPoint: request.body.focusPoint }),
    },
  )));

  const renderParams = sceneParams.extend({ renderId: z.string().uuid() });
  app.get("/stories/:storyId/scenes/:sceneId/renders", {
    schema: { security: bearerSecurity, params: sceneParams, response: { 200: z.array(sceneRenderSchema), 401: errorSchema, 404: errorSchema, 503: errorSchema } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    reply.header("cache-control", "private, no-store");
    return (await requireRenderService(renderService).list(profile.id, request.params.storyId, request.params.sceneId))
      .map((job) => sceneRenderSchema.parse(serializeSceneRender(job)));
  });
  app.post("/stories/:storyId/scenes/:sceneId/renders", {
    schema: { security: bearerSecurity, params: sceneParams, body: sceneRenderRequestSchema, response: { 202: sceneRenderSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema, 422: errorSchema, 503: errorSchema } },
  }, async (request, reply) => {
    const service = requireRenderService(renderService);
    const profile = await authenticate(application, request);
    return reply.status(202).send(sceneRenderSchema.parse(serializeSceneRender(
      await service.request(profile.id, request.params.storyId, request.params.sceneId, request.body?.mode),
    )));
  });
  app.get("/stories/:storyId/scenes/:sceneId/renders/:renderId", {
    schema: { security: bearerSecurity, params: renderParams, response: { 200: sceneRenderSchema, 401: errorSchema, 404: errorSchema, 503: errorSchema } },
  }, async (request, reply) => {
    const service = requireRenderService(renderService);
    const profile = await authenticate(application, request);
    reply.header("cache-control", "private, no-store");
    return sceneRenderSchema.parse(serializeSceneRender(
      await service.get(profile.id, request.params.storyId, request.params.sceneId, request.params.renderId),
    ));
  });
  app.get("/stories/:storyId/scenes/:sceneId/renders/:renderId/content", {
    schema: { security: bearerSecurity, params: renderParams },
  }, async (request, reply) => {
    const service = requireRenderService(renderService);
    const storage = options.objectStorage;
    if (!storage) throw new ApplicationError("render storage is unavailable", 503);
    const profile = await authenticate(application, request);
    const job = await service.get(profile.id, request.params.storyId, request.params.sceneId, request.params.renderId);
    if (!job.current) throw new ApplicationError("scene render is outdated; render the current version", 409, "scene_render_stale");
    if (job.status !== "ready" || !job.storageKey) throw new ApplicationError("scene render is not ready", 409);
    const file = sceneRenderFileType(job.input);
    return reply.type(file.mimeType)
      .header("cache-control", "private, no-store")
      .header("content-disposition", `attachment; filename="scene-${request.params.sceneId}.${file.extension}"`)
      .send(await storage.open(job.storageKey));
  });

  const frameParams = sceneParams.extend({ frameId: z.string().uuid() });
  app.post("/stories/:storyId/scenes/:sceneId/frames", {
    schema: { security: bearerSecurity, params: sceneParams, response: { 202: sceneFrameSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema, 422: errorSchema, 503: errorSchema } },
  }, async (request, reply) => {
    const service = requireRenderService(renderService);
    const profile = await authenticate(application, request);
    return reply.status(202).send(sceneFrameSchema.parse(serializeSceneRender(
      await service.requestFrame(profile.id, request.params.storyId, request.params.sceneId),
    )));
  });
  app.get("/stories/:storyId/scenes/:sceneId/frames/:frameId", {
    schema: { security: bearerSecurity, params: frameParams, response: { 200: sceneFrameSchema, 401: errorSchema, 404: errorSchema, 503: errorSchema } },
  }, async (request, reply) => {
    const service = requireRenderService(renderService);
    const profile = await authenticate(application, request);
    reply.header("cache-control", "private, no-store");
    return sceneFrameSchema.parse(serializeSceneRender(
      await service.getFrame(profile.id, request.params.storyId, request.params.sceneId, request.params.frameId),
    ));
  });
  app.get("/stories/:storyId/scenes/:sceneId/frames/:frameId/content", {
    schema: { security: bearerSecurity, params: frameParams },
  }, async (request, reply) => {
    const service = requireRenderService(renderService);
    const storage = options.objectStorage;
    if (!storage) throw new ApplicationError("render storage is unavailable", 503);
    const profile = await authenticate(application, request);
    const job = await service.getFrame(profile.id, request.params.storyId, request.params.sceneId, request.params.frameId);
    if (!job.current) throw new ApplicationError("scene frame is outdated; render the current version", 409, "scene_frame_stale");
    if (job.status !== "ready" || !job.storageKey) throw new ApplicationError("scene frame is not ready", 409);
    const file = sceneRenderFileType(job.input);
    return reply.type(file.mimeType)
      .header("cache-control", "private, no-store")
      .header("content-disposition", `inline; filename="scene-${request.params.sceneId}-frame.${file.extension}"`)
      .send(await storage.open(job.storageKey));
  });

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

function serializeStory(story: unknown) {
  // Parse readonly domain collections into the mutable public JSON response shape.
  return storySchema.parse(story);
}

function requireRenderService(service: SceneRenderService | false | undefined): SceneRenderService {
  if (!service) throw new ApplicationError("scene rendering is unavailable", 503);
  return service;
}

function isIdentityEdit(edit: MaterialEdit): boolean {
  return !edit.trim && edit.rotation === 0 && edit.crop.x === 0 && edit.crop.y === 0 && edit.crop.width === 1 && edit.crop.height === 1;
}

async function deleteStoredObject(
  mediaStorage: MediaStorage,
  storageKey: string,
  request: FastifyRequest,
  renderQueue: SceneRenderQueue | undefined,
): Promise<void> {
  try {
    await mediaStorage.delete(storageKey);
  } catch (error) {
    request.log.error({ err: error, storageKey }, "could not delete material object; scheduling retry");
    if (renderQueue) {
      try {
        await renderQueue.scheduleDeletion(storageKey);
      } catch (scheduleError) {
        request.log.error({ err: scheduleError, storageKey }, "could not schedule material object deletion");
      }
    }
  }
}
