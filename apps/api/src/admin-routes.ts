import type { AccessControlService, StoryApplication } from "@storyteller/application";
import {
  adminAccessApplyRequestSchema, adminAccessApplyResultSchema, adminAccessCatalogEntrySchema, adminAccessManagementSchema,
  adminAccessPreviewRequestSchema, adminAccessPreviewSchema, adminAccessRoleSchema, adminActivityEventSchema,
  adminActivityQuerySchema, adminAuditEntrySchema, adminAuditQuerySchema, adminEffectiveAccessSchema, adminMeSchema,
  adminOverviewSchema, adminPageSchema, adminProfileParamsSchema, adminSessionMetadataSchema, adminSessionRevokeSchema,
  adminSessionRevokedSchema, adminUserDetailSchema, adminUserSearchSchema, adminUserSummarySchema,
  browserSecurity, errorSchema,
} from "@storyteller/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticate, authenticateRequest } from "./authentication.js";
import type { AdminAccessService } from "./admin-access.js";
import type { AdminReadModel } from "./admin-database.js";

export function registerAdminRoutes(
  instance: FastifyInstance,
  application: StoryApplication,
  accessControl: AccessControlService,
  readModel: AdminReadModel,
  accessService?: AdminAccessService,
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
    const authenticated = await authenticateRequest(application, request);
    return noStore(reply).send(await readModel.sessions(
      authenticated.session.profile.id, request.params.profileId, request.query, authenticated.session.id,
    ));
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

  if (!accessService) return;

  app.get("/admin/access/capabilities", {
    schema: { security: browserSecurity, response: { 200: adminPageSchema(adminAccessCatalogEntrySchema), ...commonErrors } },
  }, async (_request, reply) => {
    const data = await accessService.capabilities();
    return noStore(reply).send({ data, total: data.length, page: 1, perPage: data.length || 1 });
  });

  app.get("/admin/access/roles", {
    schema: { security: browserSecurity, response: { 200: adminPageSchema(adminAccessRoleSchema), ...commonErrors } },
  }, async (_request, reply) => {
    const data = await accessService.roles();
    return noStore(reply).send({ data, total: data.length, page: 1, perPage: data.length || 1 });
  });

  app.get("/admin/access/limits", {
    schema: { security: browserSecurity, response: { 200: adminPageSchema(adminAccessCatalogEntrySchema), ...commonErrors } },
  }, async (_request, reply) => {
    const data = await accessService.limits();
    return noStore(reply).send({ data, total: data.length, page: 1, perPage: data.length || 1 });
  });

  app.get("/admin/access/cohorts", {
    schema: { security: browserSecurity, response: { 200: adminPageSchema(adminAccessCatalogEntrySchema), ...commonErrors } },
  }, async (_request, reply) => {
    const data = await accessService.cohorts();
    return noStore(reply).send({ data, total: data.length, page: 1, perPage: data.length || 1 });
  });

  app.get("/admin/users/:profileId/access-management", {
    schema: { security: browserSecurity, params: adminProfileParamsSchema, response: {
      200: adminAccessManagementSchema, ...commonErrors, 404: errorSchema,
    } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    const result = await accessService.management(request.params.profileId);
    await readModel.recordAudit(actor.id, {
      action: "users.access.management.read", targetType: "access", targetProfileId: request.params.profileId,
    });
    return noStore(reply).send(result);
  });

  app.post("/admin/access/previews", {
    schema: { security: browserSecurity, body: adminAccessPreviewRequestSchema, response: {
      200: adminAccessPreviewSchema, ...commonErrors, 404: errorSchema, 409: errorSchema, 422: errorSchema,
    } },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await accessService.preview(actor.id, request.body));
  });

  app.post("/admin/access/previews/:previewId/apply", {
    schema: {
      security: browserSecurity,
      params: z.object({ previewId: z.string().uuid() }),
      body: adminAccessApplyRequestSchema,
      response: { 200: adminAccessApplyResultSchema, ...commonErrors, 404: errorSchema, 409: errorSchema, 422: errorSchema },
    },
  }, async (request, reply) => {
    const actor = await authenticate(application, request);
    return noStore(reply).send(await accessService.apply(actor.id, request.params.previewId, request.body.confirmation));
  });

  const sessionParams = adminProfileParamsSchema.extend({ sessionId: adminProfileParamsSchema.shape.profileId });
  app.post("/admin/users/:profileId/sessions/:sessionId/revoke", {
    schema: { security: browserSecurity, params: sessionParams, body: adminSessionRevokeSchema, response: {
      200: adminSessionRevokedSchema, ...commonErrors, 404: errorSchema, 409: errorSchema,
    } },
  }, async (request, reply) => {
    const authenticated = await authenticateRequest(application, request);
    return noStore(reply).send(await accessService.revokeSession(
      authenticated.session.profile.id,
      authenticated.session.id,
      request.params.profileId,
      request.params.sessionId,
      request.body.reason,
    ));
  });
}

function noStore(reply: FastifyReply): FastifyReply {
  return reply.header("cache-control", "private, no-store");
}
