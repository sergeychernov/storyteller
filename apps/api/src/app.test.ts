import assert from "node:assert/strict";
import test from "node:test";
import { StoryApplication, type PlatformCredentialSummary, type ProfileAuthentication, type SessionRecord, type StoryRepository } from "@storyteller/application";
import type { PlatformCredential, PlatformProvider, Profile, Story } from "@storyteller/domain";
import { buildApi } from "./server.js";

test("protects a profile and stores its stories", async () => {
  process.env.NODE_ENV = "test";
  const api = await buildApi(new StoryApplication(new MemoryRepository()));
  assert.equal((await api.inject({ method: "GET", url: "/profile" })).statusCode, 401);

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
  const story = storyResponse.json<{ id: string; profileId: string }>();
  assert.equal(story.profileId, auth.profile.id);
  assert.equal((await api.inject({ method: "GET", url: "/stories", headers })).json<unknown[]>().length, 1);
  assert.equal((await api.inject({ method: "GET", url: `/stories/${story.id}`, headers })).statusCode, 200);
  await api.close();
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
  async upsertPlatformCredential(credential: PlatformCredential) {
    const summary = { id: credential.id, provider: credential.provider, secretHint: `••••${credential.secret.slice(-4)}` } satisfies PlatformCredentialSummary;
    this.credentials.set(`${credential.profileId}:${credential.provider}`, summary); return summary;
  }
  async listPlatformCredentials(profileId: string) { return [...this.credentials.entries()].filter(([key]) => key.startsWith(`${profileId}:`)).map(([, value]) => value); }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider) { return this.credentials.delete(`${profileId}:${provider}`); }
}
