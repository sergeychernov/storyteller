import { ApplicationError, type AuthenticatedSession, type StoryApplication } from "@storyteller/application";
import type { FastifyReply, FastifyRequest } from "fastify";

const requestAuthentication = Symbol("requestAuthentication");

export interface RequestAuthentication {
  readonly accessToken: string;
  readonly session: AuthenticatedSession;
  readonly transport: "bearer" | "cookie";
}

type AuthenticatedRequest = FastifyRequest & { [requestAuthentication]?: RequestAuthentication };

export async function authenticate(application: StoryApplication, request: FastifyRequest) {
  return (await authenticateRequest(application, request)).session.profile;
}

export async function authenticateRequest(
  application: StoryApplication,
  request: FastifyRequest,
  options: { readonly allowBearerWithCookie?: boolean } = {},
): Promise<RequestAuthentication> {
  const cached = getRequestAuthentication(request);
  if (cached) return cached;

  const authorization = request.headers.authorization;
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;
  const cookie = request.cookies[sessionCookieName()];
  if (bearer && cookie && !options.allowBearerWithCookie) {
    throw new ApplicationError("bearer and cookie authentication cannot be combined", 401, "ambiguous_authentication");
  }
  const accessToken = bearer || cookie;
  if (!accessToken) throw new ApplicationError("authentication required", 401, "authentication_required");
  const session = await application.authenticateSession(accessToken);
  const authenticated: RequestAuthentication = {
    accessToken,
    session,
    transport: bearer ? "bearer" : "cookie",
  };
  (request as AuthenticatedRequest)[requestAuthentication] = authenticated;
  return authenticated;
}

export function getRequestAuthentication(request: FastifyRequest): RequestAuthentication | undefined {
  return (request as AuthenticatedRequest)[requestAuthentication];
}

export function setSessionCookie(reply: FastifyReply, accessToken: string, expiresAt: string): void {
  reply.setCookie(sessionCookieName(), accessToken, {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies(),
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookies(reply: FastifyReply): void {
  const options = { path: "/", httpOnly: true, sameSite: "strict" as const, secure: secureCookies() };
  reply.clearCookie(sessionCookieName(), options);
  reply.clearCookie(csrfCookieName(), options);
}

export function sessionCookieName(): string {
  return secureCookies() ? "__Host-storyteller-session" : "storyteller-session";
}

export function csrfCookieName(): string {
  return secureCookies() ? "__Host-storyteller-csrf" : "storyteller-csrf";
}

export function secureCookies(): boolean {
  return process.env.SESSION_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}
