import { ApplicationError, type StoryApplication } from "@storyteller/application";
import {
  bearerSecurity, errorSchema, soundtrackPresetSchema, soundtrackProvenanceSchema,
  soundtrackRenderRequestSchema, soundtrackRenderSchema, soundtrackStemIdSchema,
} from "@storyteller/schemas";
import type { ObjectStorage } from "@storyteller/storage";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "./authentication.js";
import { soundtrackStemArtifact, type SoundtrackService } from "./soundtracks.js";

export function registerSoundtrackRoutes(
  instance: FastifyInstance,
  application: StoryApplication,
  service: SoundtrackService | undefined,
  storage: ObjectStorage | undefined,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const storyParams = z.object({ storyId: z.string().uuid() });
  const renderParams = storyParams.extend({ soundtrackId: z.string().uuid() });
  const responses = { 200: soundtrackRenderSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 503: errorSchema };

  app.get("/soundtrack-presets", {
    schema: { security: bearerSecurity, response: { 200: z.array(soundtrackPresetSchema), 401: errorSchema, 403: errorSchema, 503: errorSchema } },
  }, async (request, reply) => {
    await authenticate(application, request);
    return reply.header("cache-control", "private, max-age=300").send(requireService(service).listPresets());
  });
  app.post("/stories/:storyId/soundtracks", {
    schema: { security: bearerSecurity, params: storyParams, body: soundtrackRenderRequestSchema,
      response: { ...responses, 202: soundtrackRenderSchema, 422: errorSchema } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const value = await requireService(service).request(profile.id, request.params.storyId,
      request.body.expectedRevision, request.body.presetId, request.body.melodyVariant);
    return reply.status(202).header("cache-control", "private, no-store").send(soundtrackRenderSchema.parse(value));
  });
  app.get("/stories/:storyId/soundtracks/current", {
    schema: { security: bearerSecurity, params: storyParams, response: responses },
  }, async (request, reply) => reply.header("cache-control", "private, no-store").send(soundtrackRenderSchema.parse(
    await requireService(service).current((await authenticate(application, request)).id, request.params.storyId),
  )));
  app.get("/stories/:storyId/soundtracks/:soundtrackId", {
    schema: { security: bearerSecurity, params: renderParams, response: responses },
  }, async (request, reply) => reply.header("cache-control", "private, no-store").send(soundtrackRenderSchema.parse(
    (await requireService(service).get((await authenticate(application, request)).id,
      request.params.storyId, request.params.soundtrackId)).serialized,
  )));
  app.get("/stories/:storyId/soundtracks/:soundtrackId/audio", {
    schema: { security: bearerSecurity, params: renderParams,
      querystring: z.object({ download: z.coerce.boolean().optional(), stem: soundtrackStemIdSchema.optional() }) },
  }, async (request, reply) => {
    if (!storage) throw new ApplicationError("soundtrack storage is unavailable", 503);
    const result = await requireService(service).get((await authenticate(application, request)).id,
      request.params.storyId, request.params.soundtrackId);
    const artifact = request.query.stem ? soundtrackStemArtifact(result.job, request.query.stem) : result.job.preview;
    if (result.job.status !== "ready" || !artifact) {
      throw new ApplicationError("soundtrack is not ready", 409, "soundtrack_not_ready");
    }
    const name = `story-${request.params.storyId}-${result.job.input.presetId}${request.query.stem ? `-${request.query.stem}` : ""}.m4a`;
    reply.type("audio/mp4").header("cache-control", "private, no-store");
    if (request.query.download) reply.header("content-disposition", `attachment; filename="${name}"`);
    return reply.send(await storage.open(artifact.storageKey));
  });
  app.get("/stories/:storyId/soundtracks/:soundtrackId/provenance", {
    schema: { security: bearerSecurity, params: renderParams, response: { 200: soundtrackProvenanceSchema, 401: errorSchema,
      403: errorSchema, 404: errorSchema, 409: errorSchema, 503: errorSchema } },
  }, async (request, reply) => {
    const result = await requireService(service).get((await authenticate(application, request)).id,
      request.params.storyId, request.params.soundtrackId);
    if (result.job.status !== "ready" || !result.job.provenance) {
      throw new ApplicationError("soundtrack provenance is not ready", 409, "soundtrack_not_ready");
    }
    return reply.header("cache-control", "private, no-store")
      .header("content-disposition", `inline; filename="story-${request.params.storyId}-music-provenance.json"`)
      .send(soundtrackProvenanceSchema.parse(result.job.provenance));
  });
}

function requireService(service: SoundtrackService | undefined): SoundtrackService {
  if (!service) throw new ApplicationError("soundtrack queue is unavailable", 503);
  return service;
}
