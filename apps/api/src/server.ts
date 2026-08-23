import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ApplicationError, type StoryApplication } from "@storyteller/application";
import {
  authenticationSchema, bearerSecurity, createProjectSchema, createStorySchema, errorSchema, healthSchema,
  loginSchema, platformCredentialSchema, platformParamsSchema, profileSchema, projectSchema, registerSchema,
  setPlatformCredentialSchema, storySummarySchema, updateProfileSchema,
} from "@storyteller/schemas";
import Fastify, { type FastifyRequest } from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export async function buildApi(application: StoryApplication) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" })
    .setValidatorCompiler(validatorCompiler).setSerializerCompiler(serializerCompiler).withTypeProvider<ZodTypeProvider>();

  const configuredOrigins = process.env.WEB_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean);
  await app.register(cors, { origin: configuredOrigins?.length ? configuredOrigins : true });
  await app.register(swagger, {
    openapi: {
      info: { title: "Storyteller API", version: "0.2.0" },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "opaque" } } },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error instanceof ApplicationError ? error.statusCode
      : typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    void reply.status(statusCode).send({ message: error instanceof Error ? error.message : "Unexpected error" });
  });

  app.get("/health", { schema: { response: { 200: healthSchema } } }, async () => ({ status: "ok" as const }));
  app.post("/auth/register", {
    schema: { body: registerSchema, response: { 201: authenticationSchema, 409: errorSchema } },
  }, async (request, reply) => reply.status(201).send(await application.register(request.body)));
  app.post("/auth/login", {
    schema: { body: loginSchema, response: { 200: authenticationSchema, 401: errorSchema } },
  }, async (request) => application.login(request.body));

  app.get("/profile", {
    schema: { security: bearerSecurity, response: { 200: profileSchema, 401: errorSchema } },
  }, async (request) => authenticate(application, request));
  app.patch("/profile", {
    schema: { security: bearerSecurity, body: updateProfileSchema, response: { 200: profileSchema, 401: errorSchema } },
  }, async (request) => application.updateProfile((await authenticate(application, request)).id, request.body));

  app.get("/projects", {
    schema: { security: bearerSecurity, response: { 200: z.array(projectSchema), 401: errorSchema } },
  }, async (request) => [...await application.listProjects((await authenticate(application, request)).id)]);
  app.post("/projects", {
    schema: { security: bearerSecurity, body: createProjectSchema, response: { 201: projectSchema, 401: errorSchema } },
  }, async (request, reply) => reply.status(201).send(await application.createProject((await authenticate(application, request)).id, request.body)));

  const projectParams = z.object({ projectId: z.string().uuid() });
  app.get("/projects/:projectId/stories", {
    schema: { security: bearerSecurity, params: projectParams, response: { 200: z.array(storySummarySchema), 401: errorSchema, 404: errorSchema } },
  }, async (request) => [...await application.listStories((await authenticate(application, request)).id, request.params.projectId)]);
  app.post("/projects/:projectId/stories", {
    schema: { security: bearerSecurity, params: projectParams, body: createStorySchema, response: { 201: storySummarySchema, 401: errorSchema, 404: errorSchema } },
  }, async (request, reply) => reply.status(201).send(await application.createStory((await authenticate(application, request)).id, {
    projectId: request.params.projectId, title: request.body.title,
  })));

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
