import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ApplicationError, StoryApplication } from "@storyteller/application";
import { accountSchema, createAccountSchema, createStorySchema, errorSchema, healthSchema, storySummarySchema } from "@storyteller/schemas";
import Fastify from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

export async function buildApi(application = new StoryApplication()) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" })
    .setValidatorCompiler(validatorCompiler)
    .setSerializerCompiler(serializerCompiler)
    .withTypeProvider<ZodTypeProvider>();

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: { info: { title: "Storyteller API", version: "0.1.0" } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error instanceof ApplicationError
      ? error.statusCode
      : typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    void reply.status(statusCode).send({ message });
  });

  app.get("/health", {
    schema: { response: { 200: healthSchema } },
  }, async () => ({ status: "ok" as const }));

  app.post("/accounts", {
    schema: { body: createAccountSchema, response: { 201: accountSchema, 400: errorSchema } },
  }, async (request, reply) => {
    const account = application.createAccount(request.body);
    return reply.status(201).send({ ...account, providerConnections: [...account.providerConnections] });
  });

  const accountParams = z.object({ accountId: z.string().uuid() });

  app.get("/accounts/:accountId/stories", {
    schema: { params: accountParams, response: { 200: z.array(storySummarySchema), 404: errorSchema } },
  }, async (request) => [...application.listStories(request.params.accountId)]);

  app.post("/accounts/:accountId/stories", {
    schema: { params: accountParams, body: createStorySchema, response: { 201: storySummarySchema, 404: errorSchema } },
  }, async (request, reply) => reply.status(201).send(application.createStory({
    accountId: request.params.accountId,
    title: request.body.title,
  })));

  return app;
}
