import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StoryApplication, type PlatformCredentialSummary, type ProfileAuthentication, type SessionRecord, type StoryRepository } from "@storyteller/application";
import type { PlatformCredential, PlatformProvider, Profile, Story } from "@storyteller/domain";
import { normalizeStoredStory } from "./database.js";
import { buildApi } from "./server.js";
import { detectMediaMetadata, MediaStorage } from "./media-storage.js";

test("protects a profile, uploads media and stores its stories", async (context) => {
  process.env.NODE_ENV = "test";
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-media-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const api = await buildApi(new StoryApplication(new MemoryRepository()), { mediaStorage: new MediaStorage(mediaRoot) });
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
  const uploaded = withPhoto.json<{ scenes: { materials: { id: string; name: string; orientation: string; width: number; height: number }[] }[] }>().scenes[0]!.materials[0]!;
  assert.equal(uploaded.name, "portrait.png");
  assert.equal(uploaded.orientation, "landscape");
  assert.equal(uploaded.width, 1);
  assert.equal(uploaded.height, 1);
  const content = await api.inject({ method: "GET", url: `/stories/${story.id}/materials/${uploaded.id}/content`, headers });
  assert.equal(content.statusCode, 200);
  assert.deepEqual(content.rawPayload, png);
  const configured = await api.inject({
    method: "PATCH", url: `/stories/${story.id}/scenes/${sceneId}`, headers,
    payload: { durationSeconds: 8, layoutId: "full-frame", motion: "zoom-in" },
  });
  assert.equal(configured.json<{ scenes: { durationSeconds: number; layoutId: string }[] }>().scenes[0]!.durationSeconds, 8);
  const secondMultipart = multipartFile("second.png", "image/png", png);
  const withSecondPhoto = await api.inject({
    method: "POST", url: `/stories/${story.id}/scenes/${sceneId}/materials`,
    payload: secondMultipart.body, headers: { ...headers, "content-type": secondMultipart.contentType },
  });
  const twoMaterials = withSecondPhoto.json<{ scenes: { materials: { id: string; name: string }[] }[] }>().scenes[0]!.materials;
  const reordered = await api.inject({
    method: "PUT", url: `/stories/${story.id}/scenes/${sceneId}/material-order`, headers,
    payload: { materialIds: [twoMaterials[1]!.id, twoMaterials[0]!.id] },
  });
  assert.equal(reordered.statusCode, 200);
  assert.deepEqual(reordered.json<{ scenes: { materials: { name: string }[] }[] }>().scenes[0]!.materials.map(({ name }) => name), ["second.png", "portrait.png"]);
  await api.close();
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
  assert.deepEqual(normalized.scenes[0]?.render, { status: "idle" });
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
  async upsertPlatformCredential(credential: PlatformCredential) {
    const summary = { id: credential.id, provider: credential.provider, secretHint: `••••${credential.secret.slice(-4)}` } satisfies PlatformCredentialSummary;
    this.credentials.set(`${credential.profileId}:${credential.provider}`, summary); return summary;
  }
  async listPlatformCredentials(profileId: string) { return [...this.credentials.entries()].filter(([key]) => key.startsWith(`${profileId}:`)).map(([, value]) => value); }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider) { return this.credentials.delete(`${profileId}:${provider}`); }
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
