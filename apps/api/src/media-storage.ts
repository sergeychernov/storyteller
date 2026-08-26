import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { probeMedia } from "@storyteller/renderer";
import type { MaterialOrientation, NewSceneMaterial } from "@storyteller/domain";
import sharp from "sharp";
import { createConfiguredObjectStorage, ObjectStorageError, type DirectDownload, type ObjectStorage } from "./object-storage.js";

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
  constructor(private readonly objects: ObjectStorage = createConfiguredObjectStorage()) {}

  async store(file: UploadedFile, scope: { profileId: string; storyId: string; sceneId: string }): Promise<StoredUpload> {
    const mimeType = normalizedMimeType(file.mimetype, file.filename);
    const kind = kindFromMimeType(mimeType);
    const id = randomUUID();
    const extension = extensionFor(mimeType, file.filename);
    const storageKey = `${scope.profileId}/${scope.storyId}/${scope.sceneId}/${id}.${extension}`;
    const temporaryRoot = resolve(process.env.MEDIA_TEMP_ROOT?.trim() || tmpdir());
    await mkdir(temporaryRoot, { recursive: true });
    const temporaryDirectory = await mkdtemp(join(temporaryRoot, "storyteller-upload-"));
    const temporaryPath = join(temporaryDirectory, `source.${extension}`);

    try {
      await pipeline(file.file, createWriteStream(temporaryPath, { flags: "wx" }));
      if (file.file.truncated) throw new MediaUploadError("media file is too large", 413);
      const detected = await inspectMedia(temporaryPath, kind);
      const { size } = await stat(temporaryPath);
      try {
        await this.objects.put(storageKey, { body: createReadStream(temporaryPath), contentType: mimeType, contentLength: size });
      } catch (error) {
        throw new ObjectStorageError("could not store media", 503, { cause: error });
      }
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
      return { material, cleanup: () => this.objects.delete(storageKey) };
    } catch (error) {
      if (file.file.truncated) throw new MediaUploadError("media file is too large", 413);
      if (error instanceof MediaUploadError || error instanceof ObjectStorageError) throw error;
      throw new MediaUploadError(error instanceof Error ? `could not receive media: ${error.message}` : "could not receive media", 422);
    } finally {
      // A temporary-disk cleanup failure must not turn a completed object upload into an orphaned failed request.
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async open(storageKey: string): Promise<Readable> {
    if (!this.objects.open) throw new ObjectStorageError("direct media download is required", 501);
    return this.objects.open(storageKey);
  }

  createDownloadUrl(storageKey: string): Promise<DirectDownload | undefined> {
    return this.objects.createDownloadUrl?.(storageKey) ?? Promise.resolve(undefined);
  }
}

async function inspectMedia(path: string, kind: "image" | "video") {
  try {
    return kind === "image" ? await detectImageMetadata(path) : detectMediaMetadata(await probeMedia(path), kind);
  } catch (error) {
    if (error instanceof MediaUploadError) throw error;
    throw new MediaUploadError(error instanceof Error ? `could not inspect media: ${error.message}` : "could not inspect media", 422);
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
