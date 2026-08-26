const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export interface Profile { id: string; name: string; email: string }
export interface AuthSession { accessToken: string; expiresAt: string; profile: Profile }
export interface StorySummary {
  id: string; profileId: string; title?: string;
  status: "draft" | "rendering" | "ready" | "publishing" | "published"; sceneCount: number; revision: number;
}
export type MaterialOrientation = "portrait" | "landscape";
export type VideoAudioTag = "voice" | "music" | "ambient";
export type SceneMotion = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export interface FocusPoint { x: number; y: number }
export type ImageMaterial = {
  id: string; kind: "image"; name: string; orientation: MaterialOrientation; storageKey: string; mimeType: string;
  sizeBytes: number; width: number; height: number;
};
export type VideoMaterial = {
  id: string; kind: "video"; name: string; orientation: MaterialOrientation; storageKey: string; mimeType: string;
  sizeBytes: number; width: number; height: number; hasAudio: boolean; sourceDurationSeconds?: number; audioTags: VideoAudioTag[];
};
export type SceneMaterial = ImageMaterial | VideoMaterial;
export interface Scene {
  id: string; materials: SceneMaterial[]; durationSeconds: number; layoutId?: string; motion: SceneMotion;
  focusPoint?: FocusPoint;
  rendererId?: string; title?: string; render: { status: "idle" | "queued" | "running" | "ready" | "failed"; artifactId?: string };
}
export interface Story extends Omit<StorySummary, "sceneCount"> {
  scenes: Scene[]; narrations: { id: string; assetId: string; fromSceneId: string }[];
  music: { generationStatus: "idle" | "queued" | "running" | "ready" | "failed"; assetId?: string; applied: boolean };
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
export function getStory(token: string, storyId: string): Promise<Story> {
  return request(`/stories/${storyId}`, {}, token);
}
export function createScene(token: string, storyId: string): Promise<Story> {
  return request(`/stories/${storyId}/scenes`, { method: "POST" }, token);
}
export function uploadSceneMaterial(token: string, storyId: string, sceneId: string, file: File): Promise<Story> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request(`/stories/${storyId}/scenes/${sceneId}/materials`, { method: "POST", body: form }, token);
}
export function deleteSceneMaterial(token: string, storyId: string, sceneId: string, materialId: string): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/materials/${materialId}`, { method: "DELETE" }, token);
}
export async function getMaterialContent(token: string, storyId: string, materialId: string): Promise<Blob> {
  const response = await fetch(`${apiUrl}/stories/${storyId}/materials/${materialId}/content`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) await throwResponseError(response);
  return response.blob();
}
export function getMaterialContentAccess(token: string, storyId: string, materialId: string): Promise<{ url: string | null; expiresAt?: string }> {
  return request(`/stories/${storyId}/materials/${materialId}/content-access`, {}, token);
}
export function reorderSceneMaterials(token: string, storyId: string, sceneId: string, materialIds: readonly string[]): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/material-order`, { method: "PUT", body: JSON.stringify({ materialIds }) }, token);
}
export function configureStoryScene(token: string, storyId: string, sceneId: string, settings: {
  durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion; focusPoint?: FocusPoint;
}): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}`, { method: "PATCH", body: JSON.stringify(settings) }, token);
}
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const hasJsonBody = init.body !== undefined && init.body !== null && !(init.body instanceof FormData);
  const response = await fetch(`${apiUrl}${path}`, {
    ...init, headers: {
      ...(hasJsonBody ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers,
    },
  });
  if (!response.ok) await throwResponseError(response);
  return response.json() as Promise<T>;
}

async function throwResponseError(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({ message: response.statusText })) as { message?: string; code?: string };
  throw new ApiError(body.message ?? "Request failed", response.status, body.code);
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
