import { ApiError, createApiClient, createBrowserApiClient } from "@storyteller/api-client";
import { profileLanguages, type Profile as DomainProfile, type ProfileLanguage, type ProfileUpdate } from "@storyteller/domain";
import { useCallback, useEffect, useState } from "react";

export { ApiError } from "@storyteller/api-client";
export { createGravatarUrl, ProfileAvatar, profileInitials } from "./ProfileAvatar.js";
export { useProfileLanguage } from "./useProfileLanguage.js";

const legacySessionStorageKey = "storyteller.auth-session";

export type Profile = DomainProfile;
export type { ProfileLanguage, ProfileUpdate } from "@storyteller/domain";

export interface AuthSession {
  readonly csrfToken: string;
  readonly expiresAt: string;
  readonly profile: Profile;
}

export interface SignInResult {
  readonly accountCreated: boolean;
  readonly session: AuthSession;
}

export interface AuthClient {
  readonly signIn: (email: string, password: string, name?: string, language?: ProfileLanguage) => Promise<SignInResult>;
  readonly getSession: () => Promise<AuthSession>;
  readonly exchange: (legacyAccessToken: string) => Promise<AuthSession>;
  readonly logout: (csrfToken: string) => Promise<void>;
  readonly getProfile: (csrfToken?: string) => Promise<Profile>;
  readonly updateProfile: (csrfToken: string, input: ProfileUpdate) => Promise<Profile>;
}

export function createAuthClient(apiUrl: string): AuthClient {
  const browserApi = createBrowserApiClient(apiUrl);
  const bearerApi = createApiClient(apiUrl);

  return {
    signIn: async (email, password, name, language) => {
      const response = await browserApi.json<AuthSession & { readonly accountCreated?: boolean }>("/auth/browser/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password, ...(name ? { name } : {}), ...(language ? { language } : {}) }),
      });
      return { accountCreated: response.accountCreated === true, session: normalizeSession(response) };
    },
    getSession: async () => normalizeSession(await browserApi.json<AuthSession>("/auth/browser/session", { cache: "no-store" })),
    exchange: async (legacyAccessToken) => normalizeSession(await bearerApi.json<AuthSession>("/auth/browser/exchange", {
      method: "POST",
    }, legacyAccessToken)),
    logout: async (csrfToken) => {
      await browserApi.json<null>("/auth/browser/logout", { method: "POST" }, csrfToken).catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      });
    },
    getProfile: () => browserApi.json("/profile", { cache: "no-store" }),
    updateProfile: (csrfToken, input) => browserApi.json("/profile", { method: "PATCH", body: JSON.stringify(input) }, csrfToken),
  };
}

const restorePromises = new WeakMap<object, Promise<AuthSession | null>>();

export function usePersistentSession(client: AuthClient) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const authenticate = useCallback((nextSession: AuthSession): void => {
    localStorage.removeItem(legacySessionStorageKey);
    setSession(normalizeSession(nextSession));
  }, []);

  const clearSession = useCallback((): void => {
    const csrfToken = session?.csrfToken;
    setSession(null);
    localStorage.removeItem(legacySessionStorageKey);
    if (csrfToken) void client.logout(csrfToken);
  }, [client, session?.csrfToken]);

  const updateProfile = useCallback(async (input: ProfileUpdate): Promise<Profile> => {
    if (!session) throw new ApiError("authentication required", 401);
    const profile = await client.updateProfile(session.csrfToken, input);
    setSession({ ...session, profile });
    return profile;
  }, [client, session]);

  useEffect(() => {
    let active = true;
    let restore = restorePromises.get(client);
    if (!restore) {
      restore = restoreSession(client);
      restorePromises.set(client, restore);
      void restore.finally(() => restorePromises.delete(client));
    }
    void restore.then((restored) => {
      if (active) setSession(restored);
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => { active = false; };
  }, [client]);

  return { session, isLoading, authenticate, clearSession, updateProfile } as const;
}

export function sanitizeContinuePath(value: string | null | undefined, fallback = "/app"): string {
  if (!value || !/^\/app(?:$|\/(?:stories|clips|profile)(?:\/.*)?$)/.test(value)) return fallback;
  if (value.includes("\\") || value.includes("//")) return fallback;
  return value;
}

export function resolveContinueTarget(value: string | null | undefined, adminUrl: string, fallback = "/app"): string {
  if (value === "admin") return adminUrl.replace(/\/+$/, "");
  return sanitizeContinuePath(value, fallback);
}

export function createSignInPath(continuePath: string): string {
  return `/sign-in?continue=${encodeURIComponent(sanitizeContinuePath(continuePath))}`;
}

async function restoreSession(client: AuthClient): Promise<AuthSession | null> {
  try {
    return normalizeSession(await client.getSession());
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401)) return null;
  }
  const legacyAccessToken = loadLegacyAccessToken();
  if (!legacyAccessToken) return null;
  try {
    const session = normalizeSession(await client.exchange(legacyAccessToken));
    localStorage.removeItem(legacySessionStorageKey);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) localStorage.removeItem(legacySessionStorageKey);
    return null;
  }
}

function loadLegacyAccessToken(): string | undefined {
  try {
    const raw = localStorage.getItem(legacySessionStorageKey);
    if (!raw) return undefined;
    const session = JSON.parse(raw) as { readonly accessToken?: unknown; readonly expiresAt?: unknown };
    const expiresAt = typeof session.expiresAt === "string" ? Date.parse(session.expiresAt) : Number.NaN;
    if (typeof session.accessToken !== "string" || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      localStorage.removeItem(legacySessionStorageKey);
      return undefined;
    }
    return session.accessToken;
  } catch {
    localStorage.removeItem(legacySessionStorageKey);
    return undefined;
  }
}

function normalizeSession(session: AuthSession): AuthSession {
  const profile = session.profile as Partial<Profile>;
  const language = profileLanguages.includes(profile.language as ProfileLanguage) ? profile.language as ProfileLanguage : "en";
  return { csrfToken: session.csrfToken, expiresAt: session.expiresAt, profile: { ...profile, language } as Profile };
}
