import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export { hashContent, hashFileContent } from "./content-hash.js";

export interface StoredObjectInput {
  readonly body: Readable;
  readonly contentType: string;
  readonly contentLength: number;
}

export interface DirectDownload {
  readonly url: string;
  readonly expiresAt: Date;
}

export interface ObjectStorage {
  put(key: string, input: StoredObjectInput): Promise<void>;
  delete(key: string): Promise<void>;
  open(key: string): Promise<Readable>;
  createDownloadUrl?(key: string): Promise<DirectDownload>;
}

export class LocalObjectStorage implements ObjectStorage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, input: StoredObjectInput): Promise<void> {
    const finalPath = this.resolveKey(key);
    const temporaryPath = `${finalPath}.upload-${randomUUID()}`;
    await mkdir(dirname(finalPath), { recursive: true });
    try {
      await pipeline(input.body, createWriteStream(temporaryPath, { flags: "wx" }));
      await rename(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  delete(key: string): Promise<void> {
    return rm(this.resolveKey(key), { force: true });
  }

  open(key: string): Promise<Readable> {
    return Promise.resolve(createReadStream(this.resolveKey(key)));
  }

  private resolveKey(key: string): string {
    const target = resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) throw new ObjectStorageError("invalid object storage key", 400);
    return target;
  }
}

export interface S3ObjectStorageOptions {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly forcePathStyle?: boolean;
  readonly downloadUrlTtlSeconds?: number;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly downloadUrlTtlSeconds: number;

  constructor(options: S3ObjectStorageOptions) {
    if ((options.accessKeyId === undefined) !== (options.secretAccessKey === undefined)) {
      throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
    }
    this.bucket = options.bucket;
    this.downloadUrlTtlSeconds = options.downloadUrlTtlSeconds ?? 3_600;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
      ...(options.accessKeyId && options.secretAccessKey ? {
        credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      } : {}),
    });
  }

  async put(key: string, input: StoredObjectInput): Promise<void> {
    const upload = new Upload({
      client: this.client,
      leavePartsOnError: false,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      },
    });
    await upload.done();
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async open(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = response.Body;
    if (!body || typeof body !== "object" || !("pipe" in body)) throw new ObjectStorageError("stored object has no readable body", 502);
    return body as Readable;
  }

  async createDownloadUrl(key: string): Promise<DirectDownload> {
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.downloadUrlTtlSeconds,
    });
    return { url, expiresAt: new Date(Date.now() + this.downloadUrlTtlSeconds * 1_000) };
  }
}

export function createConfiguredObjectStorage(): ObjectStorage {
  const driver = process.env.MEDIA_STORAGE_DRIVER?.trim() || "local";
  if (driver === "local") return new LocalObjectStorage(configuredMediaRoot());
  if (driver !== "s3") throw new Error(`unsupported MEDIA_STORAGE_DRIVER: ${driver}`);

  const endpoint = optionalEnvironmentVariable("S3_ENDPOINT");
  const accessKeyId = optionalEnvironmentVariable("S3_ACCESS_KEY_ID");
  const secretAccessKey = optionalEnvironmentVariable("S3_SECRET_ACCESS_KEY");
  return new S3ObjectStorage({
    bucket: requiredEnvironmentVariable("S3_BUCKET"),
    region: process.env.S3_REGION?.trim() || "auto",
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId ? { accessKeyId } : {}),
    ...(secretAccessKey ? { secretAccessKey } : {}),
    forcePathStyle: booleanEnvironmentVariable("S3_FORCE_PATH_STYLE", false),
    downloadUrlTtlSeconds: boundedIntegerEnvironmentVariable("S3_DOWNLOAD_URL_TTL_SECONDS", 3_600, 1, 604_800),
  });
}

export class ObjectStorageError extends Error {
  constructor(message: string, readonly statusCode: number, options?: ErrorOptions) {
    super(message, options);
  }
}

function configuredMediaRoot(): string {
  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  return resolve(repositoryRoot, process.env.MEDIA_ROOT?.trim() || ".storyteller-media");
}

function requiredEnvironmentVariable(name: string): string {
  const value = optionalEnvironmentVariable(name);
  if (!value) throw new Error(`${name} is required when MEDIA_STORAGE_DRIVER=s3`);
  return value;
}

function optionalEnvironmentVariable(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function booleanEnvironmentVariable(name: string, fallback: boolean): boolean {
  const value = optionalEnvironmentVariable(name);
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function boundedIntegerEnvironmentVariable(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = optionalEnvironmentVariable(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}
