import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { probeMedia } from "@storyteller/renderer";
import type { MaterialOrientation, NewSceneMaterial } from "@storyteller/domain";
import sharp from "sharp";

export interface UploadedFile {
  readonly filename: string;
  readonly mimetype: string;
  readonly file: Readable & { readonly truncated?: boolean };
}

export interface StoredUpload {
  readonly material: NewSceneMaterial;
  cleanup(): Promise<void>;
}

export class MediaStorage {
  readonly root: string;

  constructor(root = configuredMediaRoot()) {
    this.root = resolve(root);
  }

  async store(file: UploadedFile, scope: { profileId: string; storyId: string; sceneId: string }): Promise<StoredUpload> {
    const mimeType = normalizedMimeType(file.mimetype, file.filename);
    const kind = kindFromMimeType(mimeType);
    const id = randomUUID();
    const extension = extensionFor(mimeType, file.filename);
    const storageKey = `${scope.profileId}/${scope.storyId}/${scope.sceneId}/${id}.${extension}`;
    const finalPath = this.resolveKey(storageKey);
    const temporaryPath = `${finalPath}.upload`;
    await mkdir(dirname(finalPath), { recursive: true });

    try {
      await pipeline(file.file, createWriteStream(temporaryPath, { flags: "wx" }));
      if (file.file.truncated) throw new MediaUploadError("media file is too large", 413);
      const detected = kind === "image"
        ? await detectImageMetadata(temporaryPath)
        : detectMediaMetadata(await probeMedia(temporaryPath), kind);
      const { size } = await stat(temporaryPath);
      await rename(temporaryPath, finalPath);
      const common = {
        kind, name: safeDisplayName(file.filename), orientation: detected.orientation, storageKey,
        mimeType, sizeBytes: size, width: detected.width, height: detected.height,
      } as const;
      const material: NewSceneMaterial = kind === "video"
        ? {
          ...common, kind, hasAudio: detected.hasAudio, audioTags: [],
          ...(detected.sourceDurationSeconds === undefined ? {} : { sourceDurationSeconds: detected.sourceDurationSeconds }),
        }
        : { ...common, kind };
      return { material, cleanup: () => rm(finalPath, { force: true }) };
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (file.file.truncated) throw new MediaUploadError("media file is too large", 413);
      if (error instanceof MediaUploadError) throw error;
      throw new MediaUploadError(error instanceof Error ? `could not inspect media: ${error.message}` : "could not inspect media", 422);
    }
  }

  open(storageKey: string) {
    return createReadStream(this.resolveKey(storageKey));
  }

  private resolveKey(storageKey: string): string {
    const target = resolve(this.root, storageKey);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) throw new MediaUploadError("invalid media storage key", 400);
    return target;
  }
}

export function detectMediaMetadata(probe: unknown, kind: "image" | "video"): {
  width: number; height: number; orientation: MaterialOrientation; hasAudio: boolean; sourceDurationSeconds?: number;
} {
  const streams = isRecord(probe) && Array.isArray(probe.streams) ? probe.streams.filter(isRecord) : [];
  const format = isRecord(probe) && isRecord(probe.format) ? probe.format : undefined;
  const visual = streams.find((stream) => stream.codec_type === "video");
  const encodedWidth = numberValue(visual?.width);
  const encodedHeight = numberValue(visual?.height);
  if (!encodedWidth || !encodedHeight) throw new MediaUploadError("media has no readable visual dimensions", 422);
  const rotation = rotationValue(visual);
  const rotated = Math.abs(rotation) % 180 === 90;
  const width = rotated ? encodedHeight : encodedWidth;
  const height = rotated ? encodedWidth : encodedHeight;
  const rawDuration = kind === "video" ? numberValue(visual?.duration) ?? numberValue(format?.duration) : undefined;
  const duration = rawDuration !== undefined && rawDuration > 0 ? rawDuration : undefined;
  return {
    width, height, orientation: width < height ? "portrait" : "landscape",
    hasAudio: kind === "video" && streams.some((stream) => stream.codec_type === "audio"),
    ...(duration === undefined ? {} : { sourceDurationSeconds: Math.round(duration * 1_000) / 1_000 }),
  };
}

export async function detectImageMetadata(path: string): Promise<{
  width: number; height: number; orientation: MaterialOrientation; hasAudio: false; sourceDurationSeconds?: never;
}> {
  const metadata = await sharp(path).metadata();
  const displayed = metadata.autoOrient ?? metadata;
  const width = displayed.width;
  const height = displayed.height;
  if (!width || !height) throw new MediaUploadError("image has no readable dimensions", 422);
  return { width, height, orientation: width < height ? "portrait" : "landscape", hasAudio: false };
}

export class MediaUploadError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); }
}

const mimeExtensions: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/avif": "avif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp",
};

const extensionMimeTypes: Readonly<Record<string, string>> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", avif: "image/avif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", "3gp": "video/3gpp", "3gpp": "video/3gpp",
};

function normalizedMimeType(mimeType: string, filename: string): string {
  if (mimeExtensions[mimeType]) return mimeType;
  if (mimeType && mimeType !== "application/octet-stream") throw new MediaUploadError(`unsupported media type: ${mimeType}`, 415);
  const inferred = extensionMimeTypes[extname(filename).slice(1).toLowerCase()];
  if (!inferred) throw new MediaUploadError("unsupported media type: unknown", 415);
  return inferred;
}

function kindFromMimeType(mimeType: string): "image" | "video" {
  if (!mimeExtensions[mimeType]) throw new MediaUploadError(`unsupported media type: ${mimeType || "unknown"}`, 415);
  return mimeType.startsWith("video/") ? "video" : "image";
}

function extensionFor(mimeType: string, filename: string): string {
  return mimeExtensions[mimeType] ?? (extname(filename).slice(1).toLowerCase().replace(/[^a-z0-9]/g, "") || "media");
}

function safeDisplayName(filename: string): string {
  return basename(filename).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "media";
}

function configuredMediaRoot(): string {
  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  return resolve(repositoryRoot, process.env.MEDIA_ROOT?.trim() || ".storyteller-media");
}

function rotationValue(stream: Record<string, unknown> | undefined): number {
  if (!stream) return 0;
  const tags = isRecord(stream.tags) ? stream.tags : undefined;
  const tagRotation = numberValue(tags?.rotate);
  if (tagRotation !== undefined) return tagRotation;
  const sideData = Array.isArray(stream.side_data_list) ? stream.side_data_list.filter(isRecord) : [];
  return numberValue(sideData.find((entry) => entry.rotation !== undefined)?.rotation) ?? 0;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
