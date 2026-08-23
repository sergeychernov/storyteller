const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export interface Profile { id: string; name: string; email: string }
export interface AuthSession { accessToken: string; expiresAt: string; profile: Profile }
export interface StorySummary {
  id: string; profileId: string; title?: string;
  status: "draft" | "rendering" | "ready" | "publishing" | "published"; sceneCount: number; revision: number;
}
export async function checkHealth(): Promise<boolean> { try { return (await fetch(`${apiUrl}/health`)).ok; } catch { return false; } }
export function signIn(email: string, password: string, name?: string): Promise<AuthSession> {
  return request("/auth/sign-in", { method: "POST", body: JSON.stringify({ email, password, ...(name ? { name } : {}) }) });
}
export function getProfile(token: string): Promise<Profile> { return request("/profile", {}, token); }
export function createStory(token: string, title: string): Promise<StorySummary> {
  return request("/stories", { method: "POST", body: JSON.stringify({ title }) }, token);
}
export function listStories(token: string): Promise<StorySummary[]> {
  return request("/stories", {}, token);
}
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText })) as { message?: string; code?: string };
    throw new ApiError(body.message ?? "Request failed", response.status, body.code);
  }
  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
