import { createHash } from "node:crypto";
import type { SceneRenderInput } from "./index.js";

export interface RenderDependency {
  readonly role: "original" | "image-edit" | "video-track" | "audio-track" | "scene-frame";
  readonly storageKey: string;
  readonly contentHash: string;
  readonly parents: readonly RenderDependency["role"][];
  readonly parameters: Readonly<Record<string, unknown>>;
}

/** Only parameters actually used by the renderer belong to its version. */
export function sceneRenderParameters(input: SceneRenderInput): Record<string, unknown> {
  const renderer = { rendererId: input.rendererId, rendererVersion: input.rendererVersion };
  const artifact = input.artifact === "scene-frame" ? { artifact: input.artifact, frame: input.frame } : {};
  if (input.rendererId === "still-image") return {
    ...renderer, ...artifact, durationSeconds: input.durationSeconds, motion: input.motion, focusPoint: input.focusPoint,
    source: { width: input.material.width, height: input.material.height, orientation: input.material.orientation },
    output: input.output,
  };
  return {
    ...renderer, ...artifact, mode: input.mode, trim: input.edit.trim ?? null, sourceDurationSeconds: input.sourceDurationSeconds ?? null,
    ...(input.mode === "audio" ? {} : {
      rotation: input.edit.rotation, crop: input.edit.crop,
      source: { width: input.material.width, height: input.material.height },
    }),
    ...(input.mode === "video" ? {} : { hasAudio: input.hasAudio }),
  };
}

export function hashSceneRenderInput(input: SceneRenderInput): string {
  // Old manifests retain their old fingerprint but can never match a versioned manifest.
  const value = input.dependencies ? {
    version: 1,
    parameters: sceneRenderParameters(input),
    dependencies: input.dependencies.map(({ storageKey: _location, ...dependency }) => dependency)
      .sort((a, b) => a.role.localeCompare(b.role)),
  } : input;
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
