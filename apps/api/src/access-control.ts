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
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate, authenticateRequest, getRequestAuthentication } from "./authentication.js";
import { requireAllowedOrigin } from "./browser-auth.js";

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
type RouteAccessPolicy = typeof authenticatedOnly | CapabilityCode | readonly CapabilityCode[];

const routePolicies = new Map<string, RouteAccessPolicy>([
  route("GET", "/profile", authenticatedOnly),
  route("PATCH", "/profile", authenticatedOnly),
  route("GET", "/auth/browser/session", authenticatedOnly),
  route("POST", "/auth/browser/exchange", authenticatedOnly),
  route("POST", "/auth/browser/logout", authenticatedOnly),
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
  route("GET", "/admin/me", "admin.console.access"),
  route("GET", "/admin/overview", ["admin.console.access", "admin.users.list"]),
  route("POST", "/admin/users/search", ["admin.console.access", "admin.users.list"]),
  route("GET", "/admin/users/:profileId", ["admin.console.access", "admin.users.read"]),
  route("GET", "/admin/activity", ["admin.console.access", "admin.users.activity.read"]),
  route("GET", "/admin/users/:profileId/activity", ["admin.console.access", "admin.users.activity.read"]),
  route("GET", "/admin/users/:profileId/sessions", ["admin.console.access", "admin.sessions.metadata.read"]),
  route("GET", "/admin/users/:profileId/access", ["admin.console.access", "admin.access.explain"]),
  route("GET", "/admin/audit", ["admin.console.access", "admin.audit.read"]),
]);

export function registerAccessControl(
  instance: FastifyInstance,
  application: StoryApplication,
  accessControl: AccessControlService,
  browserOrigins: ReadonlySet<string>,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook("preHandler", async (request, reply) => {
    const policy = accessPolicyForRoute(request.method, request.routeOptions.url ?? request.url);
    if (!policy) {
      if (hasBearerSecurity(request)) {
        throw new ApplicationError("secured route has no access policy", 500, "access_policy_missing");
      }
      return;
    }
    const authenticated = await authenticateRequest(application, request, {
      allowBearerWithCookie: request.routeOptions.url === "/auth/browser/exchange",
    });
    if (authenticated.transport === "cookie" && isUnsafeMethod(request.method)) {
      requireAllowedOrigin(request, browserOrigins);
      await runCsrfProtection(instance, request, reply);
      if (reply.sent) return;
    }
    const profile = getRequestAuthentication(request)?.session.profile ?? authenticated.session.profile;
    if (policy === authenticatedOnly) return;
    const requiredCapabilities = Array.isArray(policy) ? policy : [policy];
    for (const capability of requiredCapabilities) {
      const decision = await accessControl.capability(profile.id, capability);
      if (!decision.allowed) throw new ApplicationError("access denied", 403, "access_denied");
    }
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

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

type MaybeAsyncCsrfProtection = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
) => void | PromiseLike<unknown>;

async function runCsrfProtection(
  instance: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      resolve();
    };
    try {
      const result = (instance.csrfProtection as MaybeAsyncCsrfProtection)(request, reply, complete);
      if (result && typeof result.then === "function") void result.then(complete, reject);
    } catch (error) {
      reject(error);
    }
  });
}
