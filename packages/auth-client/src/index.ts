import { profileLanguages, type Profile as DomainProfile, type ProfileLanguage, type ProfileUpdate } from "@storyteller/domain";
import { useCallback, useEffect, useState } from "react";

export { createGravatarUrl, ProfileAvatar, profileInitials } from "./ProfileAvatar.js";
export { useProfileLanguage } from "./useProfileLanguage.js";

const sessionStorageKey = "storyteller.auth-session";

export type Profile = DomainProfile;
export type { ProfileLanguage, ProfileUpdate } from "@storyteller/domain";

export interface AuthSession {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly profile: Profile;
}

export interface SignInResult {
  readonly accountCreated: boolean;
  readonly session: AuthSession;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export interface AuthClient {
  readonly signIn: (email: string, password: string, name?: string, language?: ProfileLanguage) => Promise<SignInResult>;
  readonly getProfile: (token: string) => Promise<Profile>;
  readonly updateProfile: (token: string, input: ProfileUpdate) => Promise<Profile>;
}

export function createAuthClient(apiUrl: string): AuthClient {
  const request = async <T>(path: string, init: RequestInit = {}, token?: string): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) await throwResponseError(response);
    return response.json() as Promise<T>;
  };

  return {
    signIn: async (email, password, name, language) => {
      const response = await request<AuthSession & { readonly accountCreated: boolean }>("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(name ? { name } : {}), ...(language ? { language } : {}) }),
      });
      return {
        accountCreated: response.accountCreated,
        session: { accessToken: response.accessToken, expiresAt: response.expiresAt, profile: response.profile },
      };
    },
    getProfile: (token) => request("/profile", {}, token),
    updateProfile: (token, input) => request("/profile", { method: "PATCH", body: JSON.stringify(input) }, token),
  };
}

export function usePersistentSession(client: Pick<AuthClient, "getProfile" | "updateProfile">) {
  const [session, setSession] = useState<AuthSession | null>(loadSession);

  const authenticate = useCallback((nextSession: AuthSession): void => {
    localStorage.setItem(sessionStorageKey, JSON.stringify(nextSession));
    setSession(nextSession);
  }, []);

  const clearSession = useCallback((): void => {
    localStorage.removeItem(sessionStorageKey);
    setSession(null);
  }, []);

  const updateProfile = useCallback(async (input: ProfileUpdate): Promise<Profile> => {
    if (!session) throw new ApiError("authentication required", 401);
    const profile = await client.updateProfile(session.accessToken, input);
    authenticate({ ...session, profile });
    return profile;
  }, [authenticate, client, session]);

  useEffect(() => {
    if (!session) return;
    void client.getProfile(session.accessToken).then((profile) => {
      if (profile.name === session.profile.name && profile.email === session.profile.email && profile.language === session.profile.language) return;
      authenticate({ ...session, profile });
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) clearSession();
    });
  }, [authenticate, clearSession, client, session?.accessToken]);

  useEffect(() => {
    const synchronize = (event: StorageEvent) => {
      if (event.key === sessionStorageKey) setSession(loadSession());
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  return { session, authenticate, clearSession, updateProfile } as const;
}

export function sanitizeContinuePath(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !/^\/app(?:$|\/(?:stories|clips|profile)(?:\/.*)?$)/.test(value)) return fallback;
  if (value.includes("\\") || value.includes("//")) return fallback;
  return value;
}

export function createSignInPath(continuePath: string): string {
  return `/sign-in?continue=${encodeURIComponent(sanitizeContinuePath(continuePath))}`;
}

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AuthSession>;
    const expiresAt = typeof session.expiresAt === "string" ? Date.parse(session.expiresAt) : Number.NaN;
    if (!session.accessToken || !session.profile?.id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      localStorage.removeItem(sessionStorageKey);
      return null;
    }
    const profile = session.profile as Partial<Profile>;
    const language = profileLanguages.includes(profile.language as ProfileLanguage) ? profile.language as ProfileLanguage : "en";
    return { ...session, profile: { ...profile, language } } as AuthSession;
  } catch {
    localStorage.removeItem(sessionStorageKey);
    return null;
  }
}

async function throwResponseError(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({ message: response.statusText })) as { message?: string; code?: string };
  throw new ApiError(body.message ?? "Request failed", response.status, body.code);
}
