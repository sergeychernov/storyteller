import { ApplicationError, type StoryApplication } from "@storyteller/application";
import { storyExportRequestSchema, storyExportSchema, bearerSecurity, errorSchema } from "@storyteller/schemas";
import type { ObjectStorage } from "@storyteller/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "./authentication.js";
import { serializeStoryExport, type StoryExportService } from "./story-exports.js";

export function registerStoryExportRoutes(
  instance: FastifyInstance,
  application: StoryApplication,
  service: StoryExportService | undefined,
  storage: ObjectStorage | undefined,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const storyParams = z.object({ storyId: z.string().uuid() });
  const exportParams = storyParams.extend({ exportId: z.string().uuid() });
  const responses = { 200: storyExportSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 503: errorSchema };
  app.post("/stories/:storyId/exports", {
    schema: { security: bearerSecurity, params: storyParams, body: storyExportRequestSchema,
      response: { ...responses, 202: storyExportSchema, 422: errorSchema } },
  }, async (request, reply) => {
    const exportService = requireService(service);
    const profile = await authenticate(application, request);
    const job = await exportService.request(
      profile.id, request.params.storyId, request.body.expectedRevision, request.body.outputProfileId,
    );
    return reply.status(202).header("cache-control", "private, no-store").send(storyExportSchema.parse(serializeStoryExport({
      job, currentRevision: request.body.expectedRevision,
    })));
  });
  app.get("/stories/:storyId/exports/current", {
    schema: { security: bearerSecurity, params: storyParams, response: responses },
  }, async (request, reply) => {
    const result = await requireService(service).current((await authenticate(application, request)).id, request.params.storyId);
    return reply.header("cache-control", "private, no-store").send(storyExportSchema.parse(serializeStoryExport(result)));
  });
  app.get("/stories/:storyId/exports/:exportId", {
    schema: { security: bearerSecurity, params: exportParams, response: responses },
  }, async (request, reply) => {
    const result = await requireService(service).get(
      (await authenticate(application, request)).id, request.params.storyId, request.params.exportId,
    );
    return reply.header("cache-control", "private, no-store").send(storyExportSchema.parse(serializeStoryExport(result)));
  });
  app.get("/stories/:storyId/exports/:exportId/content", {
    schema: { security: bearerSecurity, params: exportParams },
  }, async (request, reply) => {
    if (!storage) throw new ApplicationError("story export storage is unavailable", 503);
    const result = await requireService(service).get(
      (await authenticate(application, request)).id, request.params.storyId, request.params.exportId,
    );
    if (result.currentRevision !== result.job.manifest.storyRevision || result.job.status === "canceled") {
      throw new ApplicationError("story export is outdated", 409, "story_export_stale");
    }
    if (result.job.status !== "ready" || !result.job.storageKey) {
      throw new ApplicationError("story export is not ready", 409, "story_export_not_ready");
    }
    const direct = await storage.createDownloadUrl?.(result.job.storageKey);
    if (direct) return reply.header("cache-control", "private, no-store").redirect(direct.url);
    return reply.type("video/mp4").header("cache-control", "private, no-store")
      .header("content-disposition", `attachment; filename="story-${request.params.storyId}.mp4"`)
      .send(await storage.open(result.job.storageKey));
  });
}

function requireService(service: StoryExportService | undefined): StoryExportService {
  if (!service) throw new ApplicationError("story export queue is unavailable", 503);
  return service;
}
