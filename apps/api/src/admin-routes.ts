import type { AccessControlService, StoryApplication } from "@storyteller/application";
import {
  adminActivityEventSchema, adminActivityQuerySchema, adminAuditEntrySchema, adminAuditQuerySchema,
  adminEffectiveAccessSchema, adminMeSchema, adminOverviewSchema, adminPageSchema, adminProfileParamsSchema,
  adminSessionMetadataSchema, adminUserDetailSchema, adminUserSearchSchema, adminUserSummarySchema,
  browserSecurity, errorSchema,
} from "@storyteller/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { authenticate } from "./authentication.js";
import type { AdminReadModel } from "./admin-database.js";

export function registerAdminRoutes(
  instance: FastifyInstance,
  application: StoryApplication,
  accessControl: AccessControlService,
  readModel: AdminReadModel,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const commonErrors = { 401: errorSchema, 403: errorSchema };

  app.get("/admin/me", {
    schema: { security: browserSecurity, response: { 200: adminMeSchema, ...commonErrors } },
  }, async (request, reply) => {
    const profile = await authenticate(application, request);
    const effective = await accessControl.resolve(profile.id);
    return noStore(reply).send({
      profile,
      capabilities: effective.capabilities.filter(({ allowed, code }) => allowed && code.startsWith("admin.")).map(({ code }) => code),
    });
  });

  app.get("/admin/overview", {
    schema: { security: browserSecurity, response: { 200: adminOverviewSchema, ...commonErrors } },
  }, async (_request, reply) => noStore(reply).send(await readModel.overview()));

  app.post("/admin/users/search", {
    schema: { security: browserSecurity, body: adminUserSearchSchema, response: { 200: adminPageSchema(adminUserSummarySchema), ...commonErrors } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await readModel.searchUsers(actor.id, request.body));
  });

  app.get("/admin/users/:profileId", {
    schema: { security: browserSecurity, params: adminProfileParamsSchema, response: { 200: adminUserDetailSchema, ...commonErrors, 404: errorSchema } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await readModel.user(actor.id, request.params.profileId));
  });

  app.get("/admin/activity", {
    schema: { security: browserSecurity, querystring: adminActivityQuerySchema, response: { 200: adminPageSchema(adminActivityEventSchema), ...commonErrors } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await readModel.activity(actor.id, request.query));
  });

  app.get("/admin/users/:profileId/activity", {
    schema: { security: browserSecurity, params: adminProfileParamsSchema, querystring: adminActivityQuerySchema, response: { 200: adminPageSchema(adminActivityEventSchema), ...commonErrors, 404: errorSchema } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await readModel.activity(actor.id, request.query, request.params.profileId));
  });

  app.get("/admin/users/:profileId/sessions", {
    schema: { security: browserSecurity, params: adminProfileParamsSchema, querystring: adminActivityQuerySchema.pick({ page: true, perPage: true }), response: { 200: adminPageSchema(adminSessionMetadataSchema), ...commonErrors, 404: errorSchema } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await readModel.sessions(actor.id, request.params.profileId, request.query));
  });

  app.get("/admin/users/:profileId/access", {
    schema: { security: browserSecurity, params: adminProfileParamsSchema, response: { 200: adminEffectiveAccessSchema, ...commonErrors, 404: errorSchema } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    await readModel.user(actor.id, request.params.profileId);
    const effective = await accessControl.resolve(request.params.profileId);
    await readModel.recordAudit(actor.id, { action: "users.access.read", targetType: "access", targetProfileId: request.params.profileId });
    return noStore(reply).send(effective);
  });

  app.get("/admin/audit", {
    schema: { security: browserSecurity, querystring: adminAuditQuerySchema, response: { 200: adminPageSchema(adminAuditEntrySchema), ...commonErrors } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await readModel.audit(actor.id, request.query));
  });
}

function noStore(reply: FastifyReply): FastifyReply {
  return reply.header("cache-control", "private, no-store");
}
