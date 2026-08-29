import { ApplicationError, type StoryApplication } from "@storyteller/application";
import type { FastifyRequest } from "fastify";

export async function authenticate(application: StoryApplication, request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new ApplicationError("authentication required", 401);
  return application.authenticate(authorization.slice(7).trim());
}
