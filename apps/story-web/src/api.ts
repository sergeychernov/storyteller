import { createBrowserApiClient } from "@storyteller/api-client";
import type { EffectiveAccess, StorySummary } from "@storyteller/application";
import type {
  AppliedMaterialEdit,
  AudioTrack,
  CollageSettings,
  EditableCollageSettings,
  FocusPoint,
  ImageMaterial,
  MaterialCrop,
  MaterialEdit,
  MaterialEditResult,
  MaterialOrientation,
  MaterialRotation,
  Scene,
  SceneMaterial,
  SceneMotion,
  Story,
  StoryTimeline,
  VideoAudioTag,
  VideoMaterial,
  VideoTrack,
  VideoTrim,
  VideoExportMode,
} from "@storyteller/domain";
export { ApiError } from "@storyteller/api-client";
export { getMaterialPresentation, getMaterialSource } from "@storyteller/domain";
export type { EffectiveAccess, StorySummary } from "@storyteller/application";
export type {
  AppliedMaterialEdit,
  AudioTrack,
  CollageSettings,
  EditableCollageSettings,
  FocusPoint,
  ImageMaterial,
  MaterialCrop,
  MaterialEdit,
  MaterialEditResult,
  MaterialOrientation,
  MaterialRotation,
  Scene,
  SceneMaterial,
  SceneMotion,
  Story,
  StoryTimeline,
  VideoAudioTag,
  VideoMaterial,
  VideoTrack,
  VideoTrim,
  VideoExportMode,
} from "@storyteller/domain";
export type { AuthSession, Profile } from "@storyteller/auth-client";

export const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const apiClient = createBrowserApiClient(apiUrl);
export interface SceneRender {
  id: string;
  current: boolean;
  status: "queued" | "running" | "ready" | "failed" | "canceled";
  progressPercent: number;
  progressPhase: "queued" | "downloading" | "rendering" | "finalizing" | "uploading" | "ready";
  sizeBytes?: number;
  error?: string;
}
export interface SceneFrame extends SceneRender {
  artifact: "scene-frame";
  inputHash: string;
  contentHash?: string;
}
export interface SceneRenderResult extends SceneRender {
  inputHash: string;
  contentHash?: string;
  createdAt?: string;
  mode: VideoExportMode;
  parameters: Record<string, unknown>;
  dependencies: { role: string; storageKey: string; contentHash: string; parents: string[]; parameters: Record<string, unknown> }[];
}
export async function checkHealth(): Promise<boolean> { try { return (await fetch(`${apiUrl}/health`)).ok; } catch { return false; } }
export function getEffectiveAccess(token: string): Promise<EffectiveAccess> {
  return request("/access/effective", { cache: "no-store" }, token);
}
export function createStory(token: string, title: string): Promise<StorySummary> {
  return request("/stories", { method: "POST", body: JSON.stringify({ title }) }, token);
}
export function listStories(token: string): Promise<StorySummary[]> {
  return request("/stories", {}, token);
}
export function getStory(token: string, storyId: string, signal?: AbortSignal): Promise<Story> {
  return request(`/stories/${storyId}`, signal ? { signal } : {}, token);
}
export function getStoryTimeline(token: string, storyId: string, signal?: AbortSignal): Promise<StoryTimeline> {
  return request(`/stories/${storyId}/timeline`, { cache: "no-store", ...(signal ? { signal } : {}) }, token);
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
export function uploadCollageBackgroundMaterial(token: string, storyId: string, sceneId: string, file: File): Promise<Story> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request(`/stories/${storyId}/scenes/${sceneId}/collage-background/material`, { method: "POST", body: form }, token);
}
export function removeCollageBackgroundMaterial(token: string, storyId: string, sceneId: string): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/collage-background`, { method: "DELETE" }, token);
}
export function deleteSceneMaterial(token: string, storyId: string, sceneId: string, materialId: string): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/materials/${materialId}`, { method: "DELETE" }, token);
}
export function editSceneMaterial(token: string, storyId: string, sceneId: string, materialId: string, edit: MaterialEdit): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}/materials/${materialId}`, {
    method: "PATCH", body: JSON.stringify(edit),
  }, token);
}
export async function getMaterialContent(token: string, storyId: string, materialId: string, signal?: AbortSignal): Promise<Blob> {
  // This URL follows the current edit, not an immutable storage object.
  return apiClient.blob(`/stories/${storyId}/materials/${materialId}/content`, {
    cache: "no-store", ...(signal ? { signal } : {}),
  }, token);
}
export function getMaterialContentAccess(token: string, storyId: string, materialId: string, signal?: AbortSignal): Promise<{ url: string | null; expiresAt?: string }> {
  return request(`/stories/${storyId}/materials/${materialId}/content-access`, signal ? { signal } : {}, token);
}
export async function getMaterialSourceContent(token: string, storyId: string, materialId: string): Promise<Blob> {
  return apiClient.blob(`/stories/${storyId}/materials/${materialId}/source-content`, {}, token);
}
export function getMaterialSourceContentAccess(token: string, storyId: string, materialId: string): Promise<{ url: string | null; expiresAt?: string }> {
  return request(`/stories/${storyId}/materials/${materialId}/source-content-access`, {}, token);
}
export function getMaterialWaveform(token: string, storyId: string, materialId: string, signal?: AbortSignal): Promise<{ peaks: number[] }> {
  return request(`/stories/${storyId}/materials/${materialId}/waveform`, signal ? { signal } : {}, token);
}
export function getMaterialAudioContentAccess(token: string, storyId: string, materialId: string, signal?: AbortSignal): Promise<{ url: string | null; expiresAt?: string }> {
  return request(`/stories/${storyId}/materials/${materialId}/audio-content-access`, signal ? { signal } : {}, token);
}
export async function getMaterialAudioContent(token: string, storyId: string, materialId: string, signal?: AbortSignal): Promise<Blob> {
  return apiClient.blob(`/stories/${storyId}/materials/${materialId}/audio-content`, {
    cache: "no-store", ...(signal ? { signal } : {}),
  }, token);
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
  durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion; focusPoint?: FocusPoint; collage?: EditableCollageSettings;
}): Promise<Story> {
  return request(`/stories/${storyId}/scenes/${sceneId}`, { method: "PATCH", body: JSON.stringify(settings) }, token);
}
export function requestSceneRender(token: string, storyId: string, sceneId: string, mode: VideoExportMode, signal?: AbortSignal): Promise<SceneRender> {
  return request(`/stories/${storyId}/scenes/${sceneId}/renders`, { method: "POST", body: JSON.stringify({ mode }), ...(signal ? { signal } : {}) }, token);
}
export function getSceneRender(token: string, storyId: string, sceneId: string, renderId: string, signal?: AbortSignal): Promise<SceneRender> {
  return request(`/stories/${storyId}/scenes/${sceneId}/renders/${renderId}`, signal ? { signal } : {}, token);
}
export function listSceneRenderResults(token: string, storyId: string, sceneId: string, signal?: AbortSignal): Promise<SceneRenderResult[]> {
  return request(`/stories/${storyId}/scenes/${sceneId}/renders`, { cache: "no-store", ...(signal ? { signal } : {}) }, token);
}
export async function downloadSceneRender(token: string, storyId: string, sceneId: string, renderId: string, signal?: AbortSignal): Promise<Blob> {
  return apiClient.blob(`/stories/${storyId}/scenes/${sceneId}/renders/${renderId}/content`, {
    cache: "no-store", ...(signal ? { signal } : {}),
  }, token);
}
export function requestSceneFrame(token: string, storyId: string, sceneId: string, signal?: AbortSignal): Promise<SceneFrame> {
  return request(`/stories/${storyId}/scenes/${sceneId}/frames`, { method: "POST", ...(signal ? { signal } : {}) }, token);
}
export function getSceneFrame(token: string, storyId: string, sceneId: string, frameId: string, signal?: AbortSignal): Promise<SceneFrame> {
  return request(`/stories/${storyId}/scenes/${sceneId}/frames/${frameId}`, signal ? { signal } : {}, token);
}
export async function downloadSceneFrame(token: string, storyId: string, sceneId: string, frameId: string, signal?: AbortSignal): Promise<Blob> {
  return apiClient.blob(`/stories/${storyId}/scenes/${sceneId}/frames/${frameId}/content`, {
    cache: "no-store", ...(signal ? { signal } : {}),
  }, token);
}
function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  return apiClient.json(path, init, token);
}
