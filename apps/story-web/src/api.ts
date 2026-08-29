import type { AudioTrack, VideoTrack, VideoExportMode } from "@storyteller/domain";
import { ApiError } from "@storyteller/auth-client";
export { getMaterialPresentation, getMaterialSource } from "@storyteller/domain";
export type { AudioTrack, VideoTrack, VideoExportMode } from "@storyteller/domain";
export { ApiError } from "@storyteller/auth-client";
export type { AuthSession, Profile } from "@storyteller/auth-client";

export const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export interface StorySummary {
  id: string; profileId: string; title?: string;
  status: "draft" | "rendering" | "ready" | "publishing" | "published"; sceneCount: number; revision: number;
}
export type MaterialOrientation = "portrait" | "landscape";
export type VideoAudioTag = "voice" | "music" | "ambient";
export type SceneMotion = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export interface FocusPoint { x: number; y: number }
export type MaterialRotation = 0 | 90 | 180 | 270;
export interface MaterialCrop { x: number; y: number; width: number; height: number }
export interface VideoTrim { startSeconds: number; endSeconds: number }
export interface MaterialEdit { rotation: MaterialRotation; crop: MaterialCrop; trim?: VideoTrim }
export interface MaterialEditResult {
  contentHash?: string;
  storageKey: string; mimeType: string; sizeBytes: number; width: number; height: number; orientation: MaterialOrientation;
  durationSeconds?: number;
}
export interface AppliedMaterialEdit extends MaterialEdit { result?: MaterialEditResult }
export type ImageMaterial = {
  contentHash?: string;
  id: string; kind: "image"; name: string; orientation: MaterialOrientation; storageKey: string; mimeType: string;
  sizeBytes: number; width: number; height: number; edit?: AppliedMaterialEdit;
};
export type VideoMaterial = {
  contentHash?: string;
  id: string; kind: "video"; name: string; orientation: MaterialOrientation; storageKey: string; mimeType: string;
  sizeBytes: number; width: number; height: number; edit?: AppliedMaterialEdit;
  hasAudio: boolean; sourceDurationSeconds?: number; audioTags: VideoAudioTag[];
  videoTrack?: VideoTrack; audioTrack?: AudioTrack;
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
export interface SceneRender {
  id: string;
  current: boolean;
  status: "queued" | "running" | "ready" | "failed" | "canceled";
  sizeBytes?: number;
  error?: string;
}
export interface SceneFrame extends SceneRender {
  artifact: "scene-frame";
  inputHash: string;
  contentHash?: string;
}
export interface SceneRenderVersion extends SceneRender {
  inputHash: string;
  contentHash?: string;
  createdAt?: string;
  mode: VideoExportMode;
  parameters: Record<string, unknown>;
  dependencies: { role: string; storageKey: string; contentHash: string; parents: string[]; parameters: Record<string, unknown> }[];
}
export async function checkHealth(): Promise<boolean> { try { return (await fetch(`${apiUrl}/health`)).ok; } catch { return false; } }
export function createStory(token: string, title: string): Promise<StorySummary> {
  return request("/stories", { method: "POST", body: JSON.stringify({ title }) }, token);
}
export function listStories(token: string): Promise<StorySummary[]> {
  return request("/stories", {}, token);
}
export function getStory(token: string, storyId: string, signal?: AbortSignal): Promise<Story> {
  return request(`/stories/${storyId}`, signal ? { signal } : {}, token);
}
export function createScene(token: string, storyId: string): Promise<Story> {
  return request(`/stories/${storyId}/scenes`, { method: "POST" }, token);
}
export function deleteScene(token: string, storyId: string, sceneId: string, expectedRevision?: number): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}`, {
    method: "DELETE", ...(expectedRevision === undefined ? {} : { body: JSON.stringify({ expectedRevision }) }),
  }, token);
}
export function uploadSceneMaterial(token: string, storyId: string, sceneId: string, file: File): Promise<Story> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request(`/stories/${storyId}/scenes/${sceneId}/materials`, { method: "POST", body: form }, token);
}
export function deleteSceneMaterial(token: string, storyId: string, sceneId: string, materialId: string): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/materials/${materialId}`, { method: "DELETE" }, token);
}
export function editSceneMaterial(token: string, storyId: string, sceneId: string, materialId: string, edit: MaterialEdit): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/materials/${materialId}`, {
    method: "PATCH", body: JSON.stringify(edit),
  }, token);
}
export async function getMaterialContent(token: string, storyId: string, materialId: string): Promise<Blob> {
  // This URL follows the current edit, not an immutable storage object.
  const response = await fetch(`${apiUrl}/stories/${storyId}/materials/${materialId}/content`, {
    cache: "no-store", headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) await throwResponseError(response);
  return response.blob();
}
export function getMaterialContentAccess(token: string, storyId: string, materialId: string): Promise<{ url: string | null; expiresAt?: string }> {
  return request(`/stories/${storyId}/materials/${materialId}/content-access`, {}, token);
}
export async function getMaterialSourceContent(token: string, storyId: string, materialId: string): Promise<Blob> {
  const response = await fetch(`${apiUrl}/stories/${storyId}/materials/${materialId}/source-content`, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) await throwResponseError(response);
  return response.blob();
}
export function getMaterialSourceContentAccess(token: string, storyId: string, materialId: string): Promise<{ url: string | null; expiresAt?: string }> {
  return request(`/stories/${storyId}/materials/${materialId}/source-content-access`, {}, token);
}
export function getMaterialWaveform(token: string, storyId: string, materialId: string, signal?: AbortSignal): Promise<{ peaks: number[] }> {
  return request(`/stories/${storyId}/materials/${materialId}/waveform`, signal ? { signal } : {}, token);
}
export function getMaterialAudioContentAccess(token: string, storyId: string, materialId: string): Promise<{ url: string | null; expiresAt?: string }> {
  return request(`/stories/${storyId}/materials/${materialId}/audio-content-access`, {}, token);
}
export async function getMaterialAudioContent(token: string, storyId: string, materialId: string): Promise<Blob> {
  const response = await fetch(`${apiUrl}/stories/${storyId}/materials/${materialId}/audio-content`, {
    cache: "no-store", headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) await throwResponseError(response);
  return response.blob();
}
export function reorderSceneMaterials(token: string, storyId: string, sceneId: string, materialIds: readonly string[]): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/material-order`, { method: "PUT", body: JSON.stringify({ materialIds }) }, token);
}
export function reorderStoryScenes(token: string, storyId: string, sceneIds: readonly string[], expectedRevision: number): Promise<Story> {
  return request(`/stories/${storyId}/scene-order`, {
    method: "PUT", body: JSON.stringify({ sceneIds, expectedRevision }),
  }, token);
}
export function moveSceneMaterials(token: string, storyId: string, sourceSceneId: string, input: {
  readonly materialIds: readonly string[];
  readonly targetSceneId: string;
  readonly targetIndex: number;
  readonly expectedRevision: number;
}): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sourceSceneId}/materials/move`, {
    method: "POST", body: JSON.stringify(input),
  }, token);
}
export function configureStoryScene(token: string, storyId: string, sceneId: string, settings: {
  durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion; focusPoint?: FocusPoint;
}): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}`, { method: "PATCH", body: JSON.stringify(settings) }, token);
}
export function requestSceneRender(token: string, storyId: string, sceneId: string, mode: VideoExportMode, signal?: AbortSignal): Promise<SceneRender> {
  return request(`/stories/${storyId}/scenes/${sceneId}/renders`, { method: "POST", body: JSON.stringify({ mode }), ...(signal ? { signal } : {}) }, token);
}
export function getSceneRender(token: string, storyId: string, sceneId: string, renderId: string, signal?: AbortSignal): Promise<SceneRender> {
  return request(`/stories/${storyId}/scenes/${sceneId}/renders/${renderId}`, signal ? { signal } : {}, token);
}
export function listSceneRenderVersions(token: string, storyId: string, sceneId: string, signal?: AbortSignal): Promise<SceneRenderVersion[]> {
  return request(`/stories/${storyId}/scenes/${sceneId}/renders`, { cache: "no-store", ...(signal ? { signal } : {}) }, token);
}
export async function downloadSceneRender(token: string, storyId: string, sceneId: string, renderId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${apiUrl}/stories/${storyId}/scenes/${sceneId}/renders/${renderId}/content`, {
    cache: "no-store", headers: { authorization: `Bearer ${token}` }, ...(signal ? { signal } : {}),
  });
  if (!response.ok) await throwResponseError(response);
  return response.blob();
}
export function requestSceneFrame(token: string, storyId: string, sceneId: string, signal?: AbortSignal): Promise<SceneFrame> {
  return request(`/stories/${storyId}/scenes/${sceneId}/frames`, { method: "POST", ...(signal ? { signal } : {}) }, token);
}
export function getSceneFrame(token: string, storyId: string, sceneId: string, frameId: string, signal?: AbortSignal): Promise<SceneFrame> {
  return request(`/stories/${storyId}/scenes/${sceneId}/frames/${frameId}`, signal ? { signal } : {}, token);
}
export async function downloadSceneFrame(token: string, storyId: string, sceneId: string, frameId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(`${apiUrl}/stories/${storyId}/scenes/${sceneId}/frames/${frameId}/content`, {
    cache: "no-store", headers: { authorization: `Bearer ${token}` }, ...(signal ? { signal } : {}),
  });
  if (!response.ok) await throwResponseError(response);
  return response.blob();
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
