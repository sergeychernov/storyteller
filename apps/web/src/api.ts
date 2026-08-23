const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export interface Profile { id: string; name: string; email: string }
export interface AuthSession { accessToken: string; expiresAt: string; profile: Profile }
export interface Project { id: string; profileId: string; name: string }
export interface StorySummary {
  id: string; projectId: string; title?: string;
  status: "draft" | "rendering" | "ready" | "publishing" | "published"; sceneCount: number; revision: number;
}
export async function checkHealth(): Promise<boolean> { try { return (await fetch(`${apiUrl}/health`)).ok; } catch { return false; } }
export function register(name: string, email: string, password: string): Promise<AuthSession> {
  return request("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
}
export function login(email: string, password: string): Promise<AuthSession> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}
export function listProjects(token: string): Promise<Project[]> { return request("/projects", {}, token); }
export function createProject(token: string, name: string): Promise<Project> {
  return request("/projects", { method: "POST", body: JSON.stringify({ name }) }, token);
}
export function createStory(token: string, projectId: string, title: string): Promise<StorySummary> {
  return request(`/projects/${projectId}/stories`, { method: "POST", body: JSON.stringify({ title }) }, token);
}
export function listStories(token: string, projectId: string): Promise<StorySummary[]> {
  return request(`/projects/${projectId}/stories`, {}, token);
}
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
    throw new Error(body.message ?? "Request failed");
  }
  return response.json() as Promise<T>;
}
