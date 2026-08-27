import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StoryApplication, type PlatformCredentialSummary, type ProfileAuthentication, type SessionRecord, type StoryRepository } from "@storyteller/application";
import type { PlatformCredential, PlatformProvider, Profile, Story } from "@storyteller/domain";
import type { ObjectDeletionJob, SceneRenderJob, SceneRenderQueue } from "@storyteller/render-queue";
import sharp from "sharp";
import { normalizeStoredStory } from "./database.js";
import { buildApi } from "./server.js";
import { detectMediaMetadata, MediaStorage } from "./media-storage.js";
import { LocalObjectStorage, S3ObjectStorage } from "./object-storage.js";

test("protects a profile, uploads media and stores its stories", async (context) => {
  process.env.NODE_ENV = "test";
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-media-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const repository = new MemoryRepository();
  const objectStorage = new LocalObjectStorage(mediaRoot);
  const renderQueue = new MemoryRenderQueue();
  const api = await buildApi(new StoryApplication(repository), {
    mediaStorage: new MediaStorage(objectStorage), objectStorage, renderQueue,
  });
  assert.equal((await api.inject({ method: "GET", url: "/profile" })).statusCode, 401);
  const reorderPreflight = await api.inject({
    method: "OPTIONS", url: "/stories/00000000-0000-4000-8000-000000000001/scenes/00000000-0000-4000-8000-000000000002/material-order",
    headers: {
      origin: "http://localhost:3000", "access-control-request-method": "PUT",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  assert.equal(reorderPreflight.statusCode, 204);
  assert.match(reorderPreflight.headers["access-control-allow-methods"] ?? "", /\bPUT\b/);

  const nameRequest = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { email: "sergej@example.com", password: "long-test-password" },
  });
  assert.equal(nameRequest.statusCode, 422);
  assert.equal(nameRequest.json<{ code: string }>().code, "profile_name_required");
  const registration = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { name: "Sergej", email: "sergej@example.com", password: "long-test-password" },
  });
  assert.equal(registration.statusCode, 200);
  const auth = registration.json<{ accessToken: string; profile: Profile }>();
  const headers = { authorization: `Bearer ${auth.accessToken}` };
  assert.equal((await api.inject({ method: "GET", url: "/profile", headers })).json<Profile>().email, "sergej@example.com");

  const storyResponse = await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "First story" } });
  assert.equal(storyResponse.statusCode, 201);
  const story = storyResponse.json<{ id: string; profileId: string; sceneCount: number }>();
  assert.equal(story.profileId, auth.profile.id);
  assert.equal(story.sceneCount, 0);
  assert.equal((await api.inject({ method: "GET", url: "/stories", headers })).json<unknown[]>().length, 1);
  assert.equal((await api.inject({ method: "GET", url: `/stories/${story.id}`, headers })).statusCode, 200);
  const withScene = await api.inject({ method: "POST", url: `/stories/${story.id}/scenes`, headers });
  assert.equal(withScene.statusCode, 201);
  const sceneId = withScene.json<{ scenes: { id: string }[] }>().scenes[0]!.id;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const multipart = multipartFile("portrait.png", "image/png", png);
  const withPhoto = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/materials`,
    payload: multipart.body, headers: { ...headers, "content-type": multipart.contentType },
  });
  assert.equal(withPhoto.statusCode, 201);
  const uploaded = withPhoto.json<{ scenes: { materials: { id: string; name: string; orientation: string; storageKey: string; width: number; height: number }[] }[] }>().scenes[0]!.materials[0]!;
  assert.equal(uploaded.name, "portrait.png");
  assert.equal(uploaded.orientation, "landscape");
  assert.equal(uploaded.width, 1);
  assert.equal(uploaded.height, 1);
  const content = await api.inject({ method: "GET", url: `/stories/${story.id}/materials/${uploaded.id}/content`, headers });
  assert.equal(content.statusCode, 200);
  assert.equal(content.headers["cache-control"], "private, no-store");
  assert.deepEqual(content.rawPayload, png);
  const contentAccess = await api.inject({
    method: "GET", url: `/stories/${story.id}/materials/${uploaded.id}/content-access`, headers,
  });
  assert.equal(contentAccess.statusCode, 200);
  assert.equal(contentAccess.headers["cache-control"], "private, no-store");
  assert.deepEqual(contentAccess.json(), { url: null });
  const firstEdit = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
    payload: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  assert.equal(firstEdit.statusCode, 200);
  const firstEditedMaterial = firstEdit.json<{
    scenes: { materials: { storageKey: string; width: number; height: number; edit: { rotation: number; result: { storageKey: string } } }[] }[];
  }>().scenes[0]!.materials[0]!;
  assert.equal(firstEditedMaterial.storageKey, uploaded.storageKey);
  assert.equal(firstEditedMaterial.width, uploaded.width);
  assert.equal(firstEditedMaterial.height, uploaded.height);
  assert.equal(firstEditedMaterial.edit.rotation, 90);
  assert.notEqual(firstEditedMaterial.edit.result.storageKey, uploaded.storageKey);
  await access(join(mediaRoot, uploaded.storageKey));
  await access(join(mediaRoot, firstEditedMaterial.edit.result.storageKey));
  const sourceContent = await api.inject({ method: "GET", url: `/stories/${story.id}/materials/${uploaded.id}/source-content`, headers });
  assert.deepEqual(sourceContent.rawPayload, png);
  const secondEdit = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
    payload: { rotation: 180, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  const latestEditStorageKey = secondEdit.json<{
    scenes: { materials: { edit: { result: { storageKey: string } } }[] }[];
  }>().scenes[0]!.materials[0]!.edit.result.storageKey;
  assert.notEqual(latestEditStorageKey, firstEditedMaterial.edit.result.storageKey);
  await assert.rejects(access(join(mediaRoot, firstEditedMaterial.edit.result.storageKey)), { code: "ENOENT" });
  await access(join(mediaRoot, uploaded.storageKey));
  await access(join(mediaRoot, latestEditStorageKey));
  const configured = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}`, headers,
    payload: { durationSeconds: 8, layoutId: "full-frame", motion: "pan-left", focusPoint: { x: 0.2, y: 0.65 } },
  });
  const configuredScene = configured.json<{
    scenes: { durationSeconds: number; layoutId: string; motion: string; focusPoint: { x: number; y: number } }[];
  }>().scenes[0]!;
  assert.equal(configuredScene.durationSeconds, 8);
  assert.equal(configuredScene.motion, "pan-left");
  assert.deepEqual(configuredScene.focusPoint, { x: 0.2, y: 0.65 });
  const firstRender = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/renders`, headers,
  });
  const cachedRender = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/renders`, headers,
  });
  assert.equal(firstRender.statusCode, 202);
  assert.equal(cachedRender.json<{ id: string }>().id, firstRender.json<{ id: string }>().id);
  assert.equal(renderQueue.jobs.size, 1);
  const secondMultipart = multipartFile("second.png", "image/png", png);
  const withSecondPhoto = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/materials`,
    payload: secondMultipart.body, headers: { ...headers, "content-type": secondMultipart.contentType },
  });
  const twoMaterials = withSecondPhoto.json<{ scenes: { materials: { id: string; name: string; storageKey: string }[] }[] }>().scenes[0]!.materials;
  const secondMaterial = twoMaterials.find(({ name }) => name === "second.png")!;
  const reordered = await api.inject({
    method: "PUT", url: `/stories/${story.id}/scenes/${sceneId}/material-order`, headers,
    payload: { materialIds: [twoMaterials[1]!.id, twoMaterials[0]!.id] },
  });
  assert.equal(reordered.statusCode, 200);
  assert.deepEqual(reordered.json<{ scenes: { materials: { name: string }[] }[] }>().scenes[0]!.materials.map(({ name }) => name), ["second.png", "portrait.png"]);
  const deleted = await api.inject({
    method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
  });
  assert.equal(deleted.statusCode, 200);
  assert.deepEqual(deleted.json<{ scenes: { materials: { name: string }[] }[] }>().scenes[0]!.materials.map(({ name }) => name), ["second.png"]);
  assert.equal((await api.inject({
    method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}/materials/${uploaded.id}`, headers,
  })).statusCode, 404);
  await assert.rejects(access(join(mediaRoot, uploaded.storageKey)), { code: "ENOENT" });
  await assert.rejects(access(join(mediaRoot, latestEditStorageKey)), { code: "ENOENT" });
  const editedSecond = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}/materials/${secondMaterial.id}`, headers,
    payload: { rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  const secondIntermediateKey = editedSecond.json<{
    scenes: { materials: { id: string; edit?: { result: { storageKey: string } } }[] }[];
  }>().scenes[0]!.materials.find(({ id }) => id === secondMaterial.id)!.edit!.result.storageKey;
  const removedScene = await api.inject({ method: "DELETE", url: `/stories/${story.id}/scenes/${sceneId}`, headers });
  assert.equal(removedScene.statusCode, 200);
  assert.deepEqual(repository.deletedSceneStorageKeys, [secondMaterial.storageKey, secondIntermediateKey]);
  await api.close();
});

test("serves each crop/rotation result without caching old pixels and renders the edited dimensions", async (context) => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-edit-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const objectStorage = new LocalObjectStorage(mediaRoot);
  const renderQueue = new MemoryRenderQueue();
  const api = await buildApi(new StoryApplication(new MemoryRepository()), {
    mediaStorage: new MediaStorage(objectStorage), objectStorage, renderQueue,
  });
  context.after(() => api.close());
  const registration = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { name: "Editor test", email: "editor@example.com", password: "long-test-password" },
  });
  const headers = { authorization: `Bearer ${registration.json<{ accessToken: string }>().accessToken}` };
  const storyResponse = await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "Edited pixels" } });
  const storyId = storyResponse.json<{ id: string }>().id;
  const withScene = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes`, headers });
  const sceneId = withScene.json<Story>().scenes[0]!.id;
  const red = [255, 0, 0], green = [0, 255, 0], blue = [0, 0, 255], white = [255, 255, 255];
  const cyan = [0, 255, 255], magenta = [255, 0, 255], yellow = [255, 255, 0], black = [0, 0, 0];
  const png = await sharp(Buffer.from([red, green, blue, white, cyan, magenta, yellow, black].flat()), {
    raw: { width: 4, height: 2, channels: 3 },
  }).png().toBuffer();
  const multipart = multipartFile("color-grid.png", "image/png", png);
  const uploaded = await api.inject({
    method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/materials`,
    payload: multipart.body, headers: { ...headers, "content-type": multipart.contentType },
  });
  const original = uploaded.json<Story>().scenes[0]!.materials[0]!;
  let previousKey: string | undefined;
  for (const [edit, size, pixels] of [
    [{ rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } }, [2, 4], [cyan, red, magenta, green, yellow, blue, black, white]],
    [{ rotation: 270, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }, [1, 2], [white, blue]],
  ] as const) {
    const response = await api.inject({
      method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers, payload: edit,
    });
    assert.equal(response.statusCode, 200, response.body);
    const material = response.json<Story>().scenes[0]!.materials[0]!;
    const result = material.edit!.result;
    assert.equal(material.storageKey, original.storageKey);
    assert.deepEqual([material.width, material.height], [4, 2]);
    assert.deepEqual([result.width, result.height], size);
    assert.equal(result.orientation, "portrait");
    assert.deepEqual({ rotation: material.edit!.rotation, crop: material.edit!.crop }, edit);
    if (previousKey) await assert.rejects(access(join(mediaRoot, previousKey)), { code: "ENOENT" });
    previousKey = result.storageKey;
    const content = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
    assert.equal(content.headers["cache-control"], "private, no-store");
    const decoded = await sharp(content.rawPayload).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([decoded.info.width, decoded.info.height], size);
    assert.deepEqual(decoded.data, Buffer.from(pixels.flat()));
    const source = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/source-content`, headers });
    assert.deepEqual(source.rawPayload, png);
    const render = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/renders`, headers });
    assert.equal(render.statusCode, 202);
    const job = [...renderQueue.jobs.values()].find(({ id }) => id === render.json<{ id: string }>().id)!;
    assert.equal(job.input.material.storageKey, result.storageKey);
    assert.deepEqual([job.input.material.width, job.input.material.height], size);
    assert.equal(job.input.material.orientation, "portrait");
  }
  assert.equal(renderQueue.jobs.size, 2);
  const reset = await api.inject({
    method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers,
    payload: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  assert.equal(reset.json<Story>().scenes[0]!.materials[0]!.edit, undefined);
  await assert.rejects(access(join(mediaRoot, previousKey!)), { code: "ENOENT" });
  const restored = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
  assert.equal(restored.headers["cache-control"], "private, no-store");
  assert.deepEqual(restored.rawPayload, png);
});

test("detects displayed orientation, rotation and an audio stream from probe data", () => {
  assert.deepEqual(detectMediaMetadata({ streams: [{ codec_type: "video", width: 1080, height: 1920 }] }, "image"), {
    width: 1080, height: 1920, orientation: "portrait", hasAudio: false,
  });
  assert.deepEqual(detectMediaMetadata({ streams: [
    { codec_type: "video", width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }, { codec_type: "audio" },
  ], format: { duration: "7.25" } }, "video"), {
    width: 1080, height: 1920, orientation: "portrait", hasAudio: true, sourceDurationSeconds: 7.25,
  });
});

test("creates a short-lived S3 download URL without exposing the secret key", async () => {
  const storage = new S3ObjectStorage({
    bucket: "storyteller-media",
    endpoint: "https://storage.example.com",
    region: "auto",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    downloadUrlTtlSeconds: 600,
  });
  const download = await storage.createDownloadUrl("profile/story/scene/material.png");
  const url = new URL(download.url);
  assert.equal(url.hostname, "storyteller-media.storage.example.com");
  assert.equal(url.pathname, "/profile/story/scene/material.png");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(url.searchParams.has("X-Amz-Signature"), true);
  assert.equal(download.url.includes("test-secret-key"), false);
});

test("opens a legacy story without fileless material placeholders", () => {
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy story",
    status: "draft",
    revision: 6,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 5,
      layoutId: "portrait-cascade-up",
      motion: "none",
      materials: [{ id: "08140c76-10ba-48c5-a000-fa56c9e7364a", kind: "image", name: "1", orientation: "portrait" }],
      render: { status: "ready", artifactId: "obsolete-preview" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  assert.deepEqual(normalized.scenes[0]?.materials, []);
  assert.equal(normalized.scenes[0]?.layoutId, undefined);
  assert.equal(normalized.scenes[0]?.focusPoint, undefined);
  assert.deepEqual(normalized.scenes[0]?.render, { status: "idle" });
});

test("upgrades a legacy scene with one image to the still-image renderer", () => {
  const normalized = normalizeStoredStory({
    id: "e95428cd-ae65-4334-8497-1f31b88c8124",
    profileId: "675efe5b-18a4-46f9-a210-00a8ebf9a01d",
    title: "Legacy still",
    status: "draft",
    revision: 3,
    scenes: [{
      id: "f89171cc-9473-4a01-a02a-fb93e5d4da6f",
      durationSeconds: 8,
      layoutId: "full-frame",
      motion: "zoom-in",
      materials: [{
        id: "08140c76-10ba-48c5-a000-fa56c9e7364a",
        kind: "image",
        name: "portrait.png",
        orientation: "portrait",
        storageKey: "profile/story/portrait.png",
        mimeType: "image/png",
        sizeBytes: 1024,
        width: 1080,
        height: 1920,
      }],
      render: { status: "idle" },
    }],
    narrations: [],
    music: { generationStatus: "idle", applied: false },
  });
  assert.equal(normalized.scenes[0]?.rendererId, "still-image");
  assert.deepEqual(normalized.scenes[0]?.focusPoint, { x: 0.5, y: 0.5 });
});

test("never exposes a stored platform secret", async () => {
  process.env.NODE_ENV = "test";
  const api = await buildApi(new StoryApplication(new MemoryRepository()));
  const registration = await api.inject({
    method: "POST", url: "/auth/register", payload: { name: "User", email: "user@example.com", password: "long-test-password" },
  });
  const token = registration.json<{ accessToken: string }>().accessToken;
  const response = await api.inject({
    method: "PUT", url: "/profile/platform-credentials/telegram", headers: { authorization: `Bearer ${token}` },
    payload: { secret: "telegram-secret-1234" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.includes("telegram-secret-1234"), false);
  assert.equal(response.json<{ secretHint: string }>().secretHint, "••••1234");
  await api.close();
});

class MemoryRepository implements StoryRepository {
  readonly profiles = new Map<string, ProfileAuthentication>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly stories = new Map<string, Story>();
  readonly credentials = new Map<string, PlatformCredentialSummary>();
  deletedSceneStorageKeys: readonly string[] = [];
  async createProfileWithSession(profile: ProfileAuthentication, session: SessionRecord) {
    if ([...this.profiles.values()].some(({ email }) => email === profile.email)) return false;
    this.profiles.set(profile.id, profile); this.sessions.set(session.tokenHash, session); return true;
  }
  async findProfileAuthenticationByEmail(email: string) { return [...this.profiles.values()].find((profile) => profile.email === email); }
  async createSession(session: SessionRecord) { this.sessions.set(session.tokenHash, session); }
  async findProfileBySession(tokenHash: string, now: Date) {
    const session = this.sessions.get(tokenHash); const profile = session && session.expiresAt > now ? this.profiles.get(session.profileId) : undefined;
    return profile && { id: profile.id, name: profile.name, email: profile.email };
  }
  async updateProfile(profileId: string, name: string) { const old = this.profiles.get(profileId)!; const profile = { ...old, name }; this.profiles.set(profileId, profile); return profile; }
  async createStory(story: Story) { this.stories.set(story.id, story); }
  async listStories(profileId: string) { return [...this.stories.values()].filter((story) => story.profileId === profileId); }
  async findStory(profileId: string, storyId: string) { const story = this.stories.get(storyId); return story?.profileId === profileId ? story : undefined; }
  async updateStory(story: Story) { this.stories.set(story.id, story); }
  async deleteScene(story: Story, _sceneId: string, storageKeys: readonly string[]) {
    this.deletedSceneStorageKeys = storageKeys;
    this.stories.set(story.id, story);
  }
  async upsertPlatformCredential(credential: PlatformCredential) {
    const summary = { id: credential.id, provider: credential.provider, secretHint: `••••${credential.secret.slice(-4)}` } satisfies PlatformCredentialSummary;
    this.credentials.set(`${credential.profileId}:${credential.provider}`, summary); return summary;
  }
  async listPlatformCredentials(profileId: string) { return [...this.credentials.entries()].filter(([key]) => key.startsWith(`${profileId}:`)).map(([, value]) => value); }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider) { return this.credentials.delete(`${profileId}:${provider}`); }
}

class MemoryRenderQueue implements SceneRenderQueue {
  readonly jobs = new Map<string, SceneRenderJob>();
  async enqueue(job: Omit<SceneRenderJob, "status" | "storageKey" | "sizeBytes" | "error">): Promise<SceneRenderJob> {
    const key = `${job.storyId}:${job.sceneId}:${job.inputHash}`;
    const existing = this.jobs.get(key);
    if (existing) return existing;
    const queued = { ...job, status: "queued" as const };
    this.jobs.set(key, queued);
    return queued;
  }
  findAuthorized(profileId: string, storyId: string, sceneId: string, renderId: string): Promise<SceneRenderJob | undefined> {
    return Promise.resolve([...this.jobs.values()].find((job) => job.profileId === profileId && job.storyId === storyId
      && job.sceneId === sceneId && job.id === renderId));
  }
  claim(): Promise<SceneRenderJob | undefined> { return Promise.resolve(undefined); }
  complete(): Promise<boolean> { return Promise.resolve(false); }
  fail(): Promise<void> { return Promise.resolve(); }
  scheduleDeletion(): Promise<void> { return Promise.resolve(); }
  claimDeletion(): Promise<ObjectDeletionJob | undefined> { return Promise.resolve(undefined); }
  completeDeletion(): Promise<void> { return Promise.resolve(); }
  failDeletion(): Promise<void> { return Promise.resolve(); }
}

function multipartFile(filename: string, mimeType: string, content: Buffer) {
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
