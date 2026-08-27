import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { probeMedia, SpawnMediaProcessRunner, type MediaProcessRunner } from "@storyteller/renderer";
import type { MaterialEdit, MaterialEditResult, MaterialOrientation, NewSceneMaterial, SceneMaterial } from "@storyteller/domain";
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

export interface StoredMaterialEdit {
  readonly result: MaterialEditResult;
}

export class MediaStorage {
  constructor(
    private readonly objects: ObjectStorage = createConfiguredObjectStorage(),
    private readonly processRunner: MediaProcessRunner = new SpawnMediaProcessRunner(),
  ) {}

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

  async edit(
    material: SceneMaterial,
    edit: MaterialEdit,
    scope: { profileId: string; storyId: string; sceneId: string },
  ): Promise<StoredMaterialEdit> {
    const output = material.kind === "image" ? imageOutput(material.mimeType) : { extension: "mp4", mimeType: "video/mp4" };
    const storageKey = `${scope.profileId}/${scope.storyId}/${scope.sceneId}/${randomUUID()}.${output.extension}`;
    const temporaryRoot = resolve(process.env.MEDIA_TEMP_ROOT?.trim() || tmpdir());
    await mkdir(temporaryRoot, { recursive: true });
    const temporaryDirectory = await mkdtemp(join(temporaryRoot, "storyteller-edit-"));
    const sourcePath = join(temporaryDirectory, `source${safeExtension(material.name)}`);
    const outputPath = join(temporaryDirectory, `edited.${output.extension}`);

    try {
      await pipeline(await this.objects.open(material.storageKey), createWriteStream(sourcePath, { flags: "wx" }));
      const dimensions = rotatedDimensions(material.width, material.height, edit.rotation);
      const crop = pixelCrop(dimensions.width, dimensions.height, edit, material.kind === "video");
      const detected = material.kind === "image"
        ? await editImage(sourcePath, outputPath, output.mimeType, edit, crop)
        : await editVideo(sourcePath, outputPath, edit, crop, this.processRunner);
      const { size } = await stat(outputPath);
      try {
        await this.objects.put(storageKey, {
          body: createReadStream(outputPath), contentType: output.mimeType, contentLength: size,
        });
      } catch (error) {
        throw new ObjectStorageError("could not store edited media", 503, { cause: error });
      }
      return {
        result: {
          storageKey,
          mimeType: output.mimeType,
          sizeBytes: size,
          width: detected.width,
          height: detected.height,
          orientation: detected.orientation,
        },
      };
    } catch (error) {
      if (error instanceof MediaUploadError || error instanceof ObjectStorageError) throw error;
      throw new MediaUploadError(error instanceof Error ? `could not edit media: ${error.message}` : "could not edit media", 422);
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  createDownloadUrl(storageKey: string): Promise<DirectDownload | undefined> {
    return this.objects.createDownloadUrl?.(storageKey) ?? Promise.resolve(undefined);
  }

  delete(storageKey: string): Promise<void> {
    return this.objects.delete(storageKey);
  }
}

interface PixelCrop { readonly left: number; readonly top: number; readonly width: number; readonly height: number }

async function editImage(
  sourcePath: string,
  outputPath: string,
  mimeType: string,
  edit: MaterialEdit,
  crop: PixelCrop,
) {
  let image = sharp(sourcePath).autoOrient().rotate(edit.rotation).extract(crop);
  if (mimeType === "image/png") image = image.png();
  else if (mimeType === "image/webp") image = image.webp({ quality: 92 });
  else if (mimeType === "image/avif") image = image.avif({ quality: 72 });
  else image = image.jpeg({ quality: 92, mozjpeg: true });
  const info = await image.toFile(outputPath);
  return {
    width: info.width,
    height: info.height,
    orientation: info.width < info.height ? "portrait" as const : "landscape" as const,
    hasAudio: false,
  };
}

async function editVideo(
  sourcePath: string,
  outputPath: string,
  edit: MaterialEdit,
  crop: PixelCrop,
  runner: MediaProcessRunner,
) {
  const rotationFilter = edit.rotation === 90 ? ["transpose=clock"]
    : edit.rotation === 180 ? ["hflip", "vflip"]
      : edit.rotation === 270 ? ["transpose=cclock"] : [];
  const filters = [...rotationFilter, `crop=${crop.width}:${crop.height}:${crop.left}:${crop.top}`].join(",");
  const result = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", sourcePath,
    "-map", "0:v:0", "-map", "0:a?", "-vf", filters,
    "-map_metadata", "-1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`ffmpeg failed (${result.exitCode}): ${result.stderr.trim()}`);
  return detectMediaMetadata(await probeMedia(outputPath, runner), "video");
}

function rotatedDimensions(width: number, height: number, rotation: MaterialEdit["rotation"]) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

function pixelCrop(width: number, height: number, edit: MaterialEdit, even: boolean): PixelCrop {
  if (even) {
    const usableWidth = width - width % 2;
    const usableHeight = height - height % 2;
    if (usableWidth < 2 || usableHeight < 2) throw new MediaUploadError("video is too small to crop", 422);
    const left = Math.min(usableWidth - 2, Math.floor(edit.crop.x * width / 2) * 2);
    const top = Math.min(usableHeight - 2, Math.floor(edit.crop.y * height / 2) * 2);
    const right = Math.max(left + 2, Math.min(usableWidth, Math.ceil((edit.crop.x + edit.crop.width) * width / 2) * 2));
    const bottom = Math.max(top + 2, Math.min(usableHeight, Math.ceil((edit.crop.y + edit.crop.height) * height / 2) * 2));
    return { left, top, width: right - left, height: bottom - top };
  }
  const left = Math.min(width - 1, Math.floor(edit.crop.x * width));
  const top = Math.min(height - 1, Math.floor(edit.crop.y * height));
  const right = Math.max(left + 1, Math.min(width, Math.ceil((edit.crop.x + edit.crop.width) * width)));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil((edit.crop.y + edit.crop.height) * height)));
  return { left, top, width: right - left, height: bottom - top };
}

function imageOutput(mimeType: string): { extension: string; mimeType: string } {
  if (mimeType === "image/png") return { extension: "png", mimeType };
  if (mimeType === "image/webp") return { extension: "webp", mimeType };
  if (mimeType === "image/avif") return { extension: "avif", mimeType };
  return { extension: "jpg", mimeType: "image/jpeg" };
}

function safeExtension(name: string): string {
  const extension = extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".media";
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
