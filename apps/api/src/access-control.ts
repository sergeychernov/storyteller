import {
  capabilityCodes,
  limitCodes,
  roleCodes,
  ApplicationError,
  type AccessControlService,
  type CapabilityCode,
  type StoryApplication,
} from "@storyteller/application";
import { bearerSecurity, errorSchema } from "@storyteller/schemas";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate } from "./authentication.js";

const accessExplanationSourceSchema = z.object({
  kind: z.enum(["plan_version", "role", "cohort", "user_override", "operational_switch"]),
  key: z.string(),
  effect: z.enum(["allow", "deny", "base", "add", "replace"]),
  via: z.string().optional(),
  decisive: z.boolean(),
});
const effectiveAccessSchema = z.object({
  planVersionCode: z.string().nullable(),
  roles: z.array(z.enum(roleCodes)),
  capabilities: z.array(z.object({
    code: z.enum(capabilityCodes),
    allowed: z.boolean(),
    expiresAt: z.iso.datetime().optional(),
    sources: z.array(accessExplanationSourceSchema),
  })),
  limits: z.array(z.object({
    code: z.enum(limitCodes),
    value: z.union([z.number().int().nonnegative(), z.literal("unlimited"), z.null()]),
    expiresAt: z.iso.datetime().optional(),
    sources: z.array(accessExplanationSourceSchema),
  })),
  evaluatedAt: z.iso.datetime(),
});

const authenticatedOnly = "authenticated" as const;
type RouteAccessPolicy = typeof authenticatedOnly | CapabilityCode;

const routePolicies = new Map<string, RouteAccessPolicy>([
  route("GET", "/profile", authenticatedOnly),
  route("PATCH", "/profile", authenticatedOnly),
  route("GET", "/access/effective", authenticatedOnly),
  route("GET", "/stories", "story.list"),
  route("POST", "/stories", "story.create"),
  route("GET", "/stories/:storyId", "story.read"),
  route("GET", "/stories/:storyId/timeline", "story.read"),
  route("PUT", "/stories/:storyId/scene-order", "story.update"),
  route("POST", "/stories/:storyId/scenes", "story.update"),
  route("DELETE", "/stories/:storyId/scenes/:sceneId", "story.delete"),
  route("POST", "/stories/:storyId/scenes/:sceneId/materials", "media.upload"),
  route("POST", "/stories/:storyId/scenes/:sceneId/collage-background/material", "media.upload"),
  route("PUT", "/stories/:storyId/scenes/:sceneId/collage-background", "story.update"),
  route("DELETE", "/stories/:storyId/scenes/:sceneId/collage-background", "story.update"),
  route("POST", "/stories/:storyId/scenes/:sceneId/materials/move", "story.update"),
  route("DELETE", "/stories/:storyId/scenes/:sceneId/materials/:materialId", "story.delete"),
  route("PATCH", "/stories/:storyId/scenes/:sceneId/materials/:materialId", "story.update"),
  route("GET", "/stories/:storyId/materials/:materialId/content", "story.read"),
  route("GET", "/stories/:storyId/materials/:materialId/content-access", "story.read"),
  route("GET", "/stories/:storyId/materials/:materialId/waveform", "story.read"),
  route("GET", "/stories/:storyId/materials/:materialId/source-content", "story.read"),
  route("GET", "/stories/:storyId/materials/:materialId/source-content-access", "story.read"),
  route("GET", "/stories/:storyId/materials/:materialId/audio-content", "story.read"),
  route("GET", "/stories/:storyId/materials/:materialId/audio-content-access", "story.read"),
  route("PUT", "/stories/:storyId/scenes/:sceneId/material-order", "story.update"),
  route("PATCH", "/stories/:storyId/scenes/:sceneId", "story.update"),
  route("GET", "/stories/:storyId/scenes/:sceneId/renders", "scene.render"),
  route("POST", "/stories/:storyId/scenes/:sceneId/renders", "scene.render"),
  route("GET", "/stories/:storyId/scenes/:sceneId/renders/:renderId", "scene.render"),
  route("GET", "/stories/:storyId/scenes/:sceneId/renders/:renderId/content", "scene.render"),
  route("POST", "/stories/:storyId/scenes/:sceneId/frames", "scene.render"),
  route("GET", "/stories/:storyId/scenes/:sceneId/frames/:frameId", "scene.render"),
  route("GET", "/stories/:storyId/scenes/:sceneId/frames/:frameId/content", "scene.render"),
  route("GET", "/profile/platform-credentials", "profile.platform_credentials.manage"),
  route("PUT", "/profile/platform-credentials/:provider", "profile.platform_credentials.manage"),
  route("DELETE", "/profile/platform-credentials/:provider", "profile.platform_credentials.manage"),
]);

export function registerAccessControl(
  instance: FastifyInstance,
  application: StoryApplication,
  accessControl: AccessControlService,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", async (request) => {
    const policy = accessPolicyForRoute(request.method, request.routeOptions.url ?? request.url);
    if (!policy) {
      if (hasBearerSecurity(request)) {
        throw new ApplicationError("secured route has no access policy", 500, "access_policy_missing");
      }
      return;
    }
    const profile = await authenticate(application, request);
    if (policy === authenticatedOnly) return;
    const decision = await accessControl.capability(profile.id, policy);
    if (!decision.allowed) throw new ApplicationError("access denied", 403, "access_denied");
  });

  app.get("/access/effective", {
    schema: {
      operationId: "getEffectiveAccess",
      summary: "Resolve the current user's effective product access",
      security: bearerSecurity,
      response: { 200: effectiveAccessSchema, 401: errorSchema, 403: errorSchema },
    },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    return reply.header("cache-control", "private, no-store").send(effectiveAccessSchema.parse(await accessControl.resolve(profile.id)));
  });
}

export function accessPolicyForRoute(method: string, url: string): RouteAccessPolicy | undefined {
  return routePolicies.get(`${method === "HEAD" ? "GET" : method.toUpperCase()} ${url}`);
}

function route(method: string, url: string, policy: RouteAccessPolicy): [string, RouteAccessPolicy] {
  return [`${method} ${url}`, policy];
}

function hasBearerSecurity(request: FastifyRequest): boolean {
  const schema = request.routeOptions.schema as { readonly security?: unknown } | undefined;
  return Array.isArray(schema?.security) && schema.security.length > 0;
}
