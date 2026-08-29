import { ApplicationError, type StoryApplication } from "@storyteller/application";
import type { FastifyRequest } from "fastify";

const authenticatedProfile = Symbol("authenticatedProfile");
type AuthenticatedRequest = FastifyRequest & { [authenticatedProfile]?: Awaited<ReturnType<StoryApplication["authenticate"]>> };

export async function authenticate(application: StoryApplication, request: FastifyRequest) {
  const cached = (request as AuthenticatedRequest)[authenticatedProfile];
  if (cached) return cached;
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) throw new ApplicationError("authentication required", 401);
  const profile = await application.authenticate(authorization.slice(7).trim());
  (request as AuthenticatedRequest)[authenticatedProfile] = profile;
  return profile;
}
