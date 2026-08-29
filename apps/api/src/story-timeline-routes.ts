import type { StoryApplication } from "@storyteller/application";
import {
  bearerSecurity, errorSchema, moveSceneMaterialsSchema, reorderStoryScenesSchema, storySchema, storyTimelineSchema,
} from "@storyteller/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "./authentication.js";

export function registerStoryTimelineRoutes(instance: FastifyInstance, application: StoryApplication): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const storyParams = z.object({ storyId: z.string().uuid() });
  const editResponse = { 200: storySchema, 400: errorSchema, 401: errorSchema, 404: errorSchema, 409: errorSchema, 422: errorSchema };

  app.get("/stories/:storyId/timeline", {
    schema: {
      operationId: "getStoryTimeline", summary: "Read the editorial timeline and duration warnings",
      description: "Derives timing from the persisted scene order, photo/layout durations and original-time video trims. "
        + "Empty scenes contribute zero with a warning; unknown video durations yield null totals and subsequent offsets. "
        + "Only hard cuts are supported. YouTube duration profiles are advisory, not publication eligibility or a selected destination.",
      security: bearerSecurity, params: storyParams,
      response: { 200: storyTimelineSchema, 400: errorSchema, 401: errorSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    reply.header("cache-control", "private, no-store");
    return storyTimelineSchema.parse(await application.getStoryTimeline(profile.id, request.params.storyId));
  });

  app.put("/stories/:storyId/scene-order", {
    schema: {
      operationId: "reorderStoryScenes", summary: "Replace the complete scene order",
      description: "sceneIds must contain every scene exactly once. expectedRevision is required; stale or concurrent edits return 409. "
        + "Preserves individual scene renders and narration anchors; invalidates applied story music. Returns the updated story.",
      security: bearerSecurity, params: storyParams, body: reorderStoryScenesSchema, response: editResponse,
    },
  }, async (request) => storySchema.parse(await application.reorderStoryScenes(
    (await authenticate(application, request)).id, request.params.storyId, request.body.sceneIds, request.body.expectedRevision,
  )));

  app.post("/stories/:storyId/scenes/:sceneId/materials/move", {
    schema: {
      operationId: "moveSceneMaterials", summary: "Move materials to another scene atomically",
      description: "Moves materialIds from the source scene to targetSceneId in this same story, in the order supplied. "
        + "targetIndex is a zero-based insertion position before the move (0 through the target's material count). "
        + "Retains IDs, edits, tracks and storage keys; resets presentation for both scenes and leaves an empty source in place. "
        + "Does not copy or delete files. Requires expectedRevision and returns the updated story.",
      security: bearerSecurity, params: storyParams.extend({ sceneId: z.string().uuid() }),
      body: moveSceneMaterialsSchema, response: editResponse,
    },
  }, async (request) => storySchema.parse(await application.moveSceneMaterials(
    (await authenticate(application, request)).id, request.params.storyId, request.params.sceneId, request.body,
  )));
}
