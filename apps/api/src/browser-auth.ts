import { ApplicationError, type StoryApplication } from "@storyteller/application";
import { bearerSecurity, browserSessionSchema, errorSchema, signInSchema } from "@storyteller/schemas";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { authenticateRequest, clearSessionCookies, setSessionCookie } from "./authentication.js";

export function registerBrowserAuthRoutes(
  instance: FastifyInstance,
  application: StoryApplication,
  allowedOrigins: ReadonlySet<string>,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post("/auth/browser/sign-in", {
    schema: { body: signInSchema, response: { 200: browserSessionSchema, 401: errorSchema, 409: errorSchema, 422: errorSchema } },
  }, async (request, reply) => {
    requireAllowedOrigin(request, allowedOrigins);
    const result = await application.signIn({
      email: request.body.email,
      password: request.body.password,
      ...(request.body.name === undefined ? {} : { name: request.body.name }),
      ...(request.body.language === undefined ? {} : { language: request.body.language }),
    });
    const session = await application.authenticateSession(result.accessToken);
    setSessionCookie(reply, result.accessToken, result.expiresAt);
    return reply.header("cache-control", "private, no-store").send({
      accountCreated: result.accountCreated,
      expiresAt: result.expiresAt,
      profile: result.profile,
      csrfToken: reply.generateCsrf({ userInfo: session.id }),
    });
  });

  app.get("/auth/browser/session", {
    schema: { response: { 200: browserSessionSchema, 401: errorSchema } },
  }, async (request, reply) => {
    const authenticated = await authenticateRequest(application, request);
    if (authenticated.transport !== "cookie") {
      throw new ApplicationError("cookie authentication required", 401, "cookie_authentication_required");
    }
    return reply.header("cache-control", "private, no-store").send({
      expiresAt: authenticated.session.expiresAt,
      profile: authenticated.session.profile,
      csrfToken: reply.generateCsrf({ userInfo: authenticated.session.id }),
    });
  });

  app.post("/auth/browser/exchange", {
    schema: { security: bearerSecurity, response: { 200: browserSessionSchema, 401: errorSchema } },
  }, async (request, reply) => {
    requireAllowedOrigin(request, allowedOrigins);
    const authenticated = await authenticateRequest(application, request, { allowBearerWithCookie: true });
    if (authenticated.transport !== "bearer") {
      throw new ApplicationError("bearer authentication required", 401, "bearer_authentication_required");
    }
    const result = await application.exchangeSession(authenticated.accessToken);
    const session = await application.authenticateSession(result.accessToken);
    setSessionCookie(reply, result.accessToken, result.expiresAt);
    return reply.header("cache-control", "private, no-store").send({
      expiresAt: result.expiresAt,
      profile: result.profile,
      csrfToken: reply.generateCsrf({ userInfo: session.id }),
    });
  });

  app.post("/auth/browser/logout", {
    schema: { response: { 204: z.null(), 401: errorSchema, 403: errorSchema } },
  }, async (request, reply) => {
    const authenticated = await authenticateRequest(application, request);
    if (authenticated.transport !== "cookie") {
      throw new ApplicationError("cookie authentication required", 401, "cookie_authentication_required");
    }
    await application.revokeSession(authenticated.accessToken);
    clearSessionCookies(reply);
    return reply.status(204).send(null);
  });
}

export function requireAllowedOrigin(request: FastifyRequest, allowedOrigins: ReadonlySet<string>): void {
  const origin = request.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) {
    throw new ApplicationError("origin is not allowed", 403, "origin_not_allowed");
  }
}
