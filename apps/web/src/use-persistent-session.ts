import { useEffect, useState } from "react";
import { ApiError, getProfile, type AuthSession } from "./api.js";

const SESSION_STORAGE_KEY = "storyteller.auth-session";

export function usePersistentSession() {
  const [session, setSession] = useState<AuthSession | null>(loadSession);

  useEffect(() => {
    if (!session) return;
    void getProfile(session.accessToken).then((profile) => {
      if (profile.name === session.profile.name && profile.email === session.profile.email) return;
      authenticate({ ...session, profile });
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) clearSession();
    });
  }, [session?.accessToken]);

  function authenticate(nextSession: AuthSession): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function clearSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
  }

  return { session, authenticate, clearSession } as const;
}

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AuthSession>;
    const expiresAt = typeof session.expiresAt === "string" ? Date.parse(session.expiresAt) : Number.NaN;
    if (!session.accessToken || !session.profile?.id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session as AuthSession;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}
