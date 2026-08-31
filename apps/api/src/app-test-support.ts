import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import {
  ApplicationError,
  StoryApplication,
  type PlatformCredentialSummary,
  type ProductActivityRecord,
  type ProfileAuthentication,
  type SessionRecord,
  type StoryRepository,
} from "@storyteller/application";
import {
  type PlatformCredential,
  type PlatformProvider,
  type ProfileUpdate,
  type Story,
} from "@storyteller/domain";
import {
  sceneRenderSlot,
  type ObjectDeletionJob,
  type SceneRenderJob,
  type SceneRenderQueue,
} from "@storyteller/render-queue";
import type { LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { buildApi } from "./server.js";
import { MediaStorage } from "./media-storage.js";
import { LocalObjectStorage } from "./object-storage.js";

export async function renderFixture(context: TestContext) {
  process.env.NODE_ENV = "test";
  const root = await mkdtemp(join(tmpdir(), "storyteller-render-results-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const storage = new LocalObjectStorage(root);
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const queue = new MemoryRenderQueue();
  const api = await buildApi(application, { mediaStorage: new MediaStorage(storage), objectStorage: storage, renderQueue: queue });
  context.after(() => api.close());
  const auth = await application.register({ name: "Test", email: "render-results@example.com", password: "long-test-password" });
  const profileId = auth.profile.id;
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  const storyId = (await application.createStory(profileId, { title: "Versions" })).id;
  const ids: string[] = [];
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "red" } }).png().toBuffer();
  for (let index = 0; index < 2; index++) {
    const id = (await application.createScene(profileId, storyId)).scenes.at(-1)!.id;
    const multipart = multipartFile(`photo-${index}.png`, "image/png", png);
    const response = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${id}/materials`,
      headers: { ...headers, "content-type": multipart.contentType }, payload: multipart.body });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json<Story>().scenes.find(({ id: sceneId }) => sceneId === id)!.materials[0]!.contentHash,
      createHash("sha256").update(png).digest("hex"));
    ids.push(id);
  }
  return { api, application, queue, storage, repository, storyId, profileId, headers, sceneId: ids[0]!, otherSceneId: ids[1]! };
}

export class MemoryRepository implements StoryRepository {
  readonly profiles = new Map<string, ProfileAuthentication>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly stories = new Map<string, Story>();
  readonly credentials = new Map<string, PlatformCredentialSummary>();
  readonly revokedSessions = new Set<string>();
  readonly activities: Array<ProductActivityRecord & { readonly profileId: string }> = [];
  deletedSceneStorageKeys: readonly string[] = [];
  async createProfileWithSession(profile: ProfileAuthentication, session: SessionRecord) {
    if ([...this.profiles.values()].some(({ email }) => email === profile.email)) return false;
    this.profiles.set(profile.id, profile); this.sessions.set(session.tokenHash, session); return true;
  }
  async findProfileAuthenticationByEmail(email: string) { return [...this.profiles.values()].find((profile) => profile.email === email); }
  async createSession(session: SessionRecord) { this.sessions.set(session.tokenHash, session); }
  async findSessionByTokenHash(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash);
    const profile = session && session.expiresAt > now && !this.revokedSessions.has(tokenHash)
      ? this.profiles.get(session.profileId) : undefined;
    return profile && session ? {
      id: session.id,
      expiresAt: session.expiresAt.toISOString(),
      profile: { id: profile.id, name: profile.name, email: profile.email, language: profile.language },
    } : undefined;
  }
  async rotateSession(oldTokenHash: string, session: SessionRecord) {
    if (!this.sessions.has(oldTokenHash) || this.revokedSessions.has(oldTokenHash)) throw new ApplicationError("invalid session", 401);
    this.revokedSessions.add(oldTokenHash); this.sessions.set(session.tokenHash, session);
  }
  async revokeSession(tokenHash: string, _now: Date) {
    if (!this.sessions.has(tokenHash) || this.revokedSessions.has(tokenHash)) return false;
    this.revokedSessions.add(tokenHash); return true;
  }
  async touchSession(_sessionId: string, _now: Date) {}
  async updateProfile(profileId: string, input: ProfileUpdate) {
    const old = this.profiles.get(profileId)!; const profile = { ...old, ...input }; this.profiles.set(profileId, profile); return profile;
  }
  async createStory(story: Story) { this.stories.set(story.id, story); }
  async listStories(profileId: string) { return [...this.stories.values()].filter((story) => story.profileId === profileId); }
  async findStory(profileId: string, storyId: string) { const story = this.stories.get(storyId); return story?.profileId === profileId ? story : undefined; }
  async updateStory(story: Story, activity?: ProductActivityRecord) {
    const current = this.stories.get(story.id);
    if (!current || current.profileId !== story.profileId) throw new ApplicationError("story not found", 404);
    if (current.revision !== story.revision - 1) throw new ApplicationError("story has changed", 409, "story_revision_conflict");
    this.stories.set(story.id, story);
    if (activity) this.activities.push({ profileId: story.profileId, ...activity });
  }
  async deleteScene(story: Story, _sceneId: string, storageKeys: readonly string[]) {
    await this.updateStory(story);
    this.deletedSceneStorageKeys = storageKeys;
  }
  async upsertPlatformCredential(credential: PlatformCredential) {
    const summary = { id: credential.id, provider: credential.provider, secretHint: `••••${credential.secret.slice(-4)}` } satisfies PlatformCredentialSummary;
    this.credentials.set(`${credential.profileId}:${credential.provider}`, summary); return summary;
  }
  async listPlatformCredentials(profileId: string) { return [...this.credentials.entries()].filter(([key]) => key.startsWith(`${profileId}:`)).map(([, value]) => value); }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider) { return this.credentials.delete(`${profileId}:${provider}`); }
}

export class MemoryRenderQueue implements SceneRenderQueue {
  readonly jobs = new Map<string, SceneRenderJob>();
  async enqueue(job: Omit<SceneRenderJob, "status" | "storageKey" | "sizeBytes" | "error">): Promise<SceneRenderJob> {
    const key = `${job.storyId}:${job.sceneId}:${job.inputHash}`;
    const existing = this.jobs.get(key);
    if (existing) return existing;
    const queued = { ...job, status: "queued" as const };
    this.jobs.set(key, queued);
    for (const [otherKey, candidate] of this.jobs) {
      if (otherKey !== key && candidate.storyId === job.storyId && candidate.sceneId === job.sceneId
        && sceneRenderSlot(candidate.input) === sceneRenderSlot(job.input)) this.jobs.delete(otherKey);
    }
    return queued;
  }
  findAuthorized(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob | undefined> {
    return Promise.resolve([...this.jobs.values()].find((job) => job.profileId === profileId && job.storyId === storyId
      && job.sceneId === sceneId && job.id === renderId));
  }
  async listAuthorized(profileId: string, storyId: string, sceneId: string): Promise<readonly SceneRenderJob[]> {
    return [...this.jobs.values()].filter((job) => job.profileId === profileId && job.storyId === storyId && job.sceneId === sceneId).reverse();
  }
  claim(): Promise<SceneRenderJob | undefined> { return Promise.resolve(undefined); }
  reportProgress(): Promise<boolean> { return Promise.resolve(false); }
  async complete(renderId: string, _workerId: string, storageKey: string, sizeBytes: number, contentHash: string): Promise<boolean> {
    const entry = [...this.jobs.entries()].find(([, job]) => job.id === renderId);
    if (!entry) return false;
    this.jobs.set(entry[0], { ...entry[1], status: "ready", storageKey, sizeBytes, contentHash });
    return true;
  }
  fail(): Promise<void> { return Promise.resolve(); }
  scheduleDeletion(): Promise<void> { return Promise.resolve(); }
  claimDeletion(): Promise<ObjectDeletionJob | undefined> { return Promise.resolve(undefined); }
  completeDeletion(): Promise<void> { return Promise.resolve(); }
  failDeletion(): Promise<void> { return Promise.resolve(); }
}

export async function sceneDeletionFixture(context: TestContext, sceneCount = 3) {
  process.env.NODE_ENV = "test";
  const repository = new MemoryRepository();
  const application = new StoryApplication(repository);
  const api = await buildApi(application);
  context.after(() => api.close());
  const auth = await application.register({ name: "Test", email: "delete@example.com", password: "long-test-password" });
  const summary = await application.createStory(auth.profile.id, { title: "Deletion test" });
  let story = await application.getStory(auth.profile.id, summary.id);
  for (let index = 0; index < sceneCount; index++) story = await application.createScene(auth.profile.id, story.id);
  return { api, repository, application, story, headers: { authorization: `Bearer ${auth.accessToken}` } };
}

export function multipartFile(filename: string, mimeType: string, content: Buffer) {
  const boundary = "storyteller-test-boundary";
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

export function responseCookies(response: LightMyRequestResponse): string[] {
  const values = response.headers["set-cookie"];
  return values === undefined ? [] : Array.isArray(values) ? values : [values];
}

export function cookieHeader(setCookies: readonly string[]): string {
  return setCookies.map((value) => value.slice(0, value.indexOf(";") < 0 ? undefined : value.indexOf(";"))).join("; ");
}

export function mergeCookieHeader(existing: string, setCookies: readonly string[]): string {
  const cookies = new Map(existing.split("; ").filter(Boolean).map((value) => {
    const separator = value.indexOf("=");
    return [value.slice(0, separator), value.slice(separator + 1)] as const;
  }));
  for (const setCookie of setCookies) {
    const value = setCookie.slice(0, setCookie.indexOf(";") < 0 ? undefined : setCookie.indexOf(";"));
    const separator = value.indexOf("=");
    cookies.set(value.slice(0, separator), value.slice(separator + 1));
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}
