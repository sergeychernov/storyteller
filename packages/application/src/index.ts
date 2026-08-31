import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import {
  addMaterial, addScene, buildStoryTimeline, configureScene, createStory, DomainError, materialStorageKeys, moveSceneMaterials, removeMaterial, removeScene, reorderMaterials, reorderScenes, replaceMaterial, setCollageBackground,
  type EditableCollageSettings, type FocusPoint, type MoveSceneMaterialsInput, type NewSceneMaterial, type PlatformCredential, type PlatformProvider, type Profile, type ProfileLanguage, type ProfileUpdate, type Scene, type SceneMaterial, type SceneMotion, type Story,
} from "@storyteller/domain";
import { timelineDurationLimits } from "./timeline-formats.js";

export * from "./access-control.js";

export interface ProfileAuthentication extends Profile { readonly passwordHash: string }
export interface PlatformCredentialSummary {
  readonly id: string;
  readonly provider: PlatformProvider;
  readonly externalAccountId?: string;
  readonly secretHint: string;
}
export interface StorySummary {
  readonly id: string;
  readonly profileId: string;
  readonly title?: string;
  readonly status: Story["status"];
  readonly sceneCount: number;
  readonly revision: number;
}
export interface SessionRecord { readonly profileId: string; readonly tokenHash: string; readonly expiresAt: Date }
export interface StoryRepository {
  createProfileWithSession(input: ProfileAuthentication, session: SessionRecord): Promise<boolean>;
  findProfileAuthenticationByEmail(email: string): Promise<ProfileAuthentication | undefined>;
  createSession(session: SessionRecord): Promise<void>;
  findProfileBySession(tokenHash: string, now: Date): Promise<Profile | undefined>;
  updateProfile(profileId: string, input: ProfileUpdate): Promise<Profile>;
  createStory(story: Story): Promise<void>;
  listStories(profileId: string): Promise<readonly Story[]>;
  findStory(profileId: string, storyId: string): Promise<Story | undefined>;
  /** Persist only if the stored revision is story.revision - 1; otherwise reject with a conflict. */
  updateStory(story: Story): Promise<void>;
  /** Apply the same revision check and schedule cleanup atomically with the story update. */
  deleteScene(story: Story, sceneId: string, storageKeys: readonly string[]): Promise<void>;
  upsertPlatformCredential(credential: PlatformCredential): Promise<PlatformCredentialSummary>;
  listPlatformCredentials(profileId: string): Promise<readonly PlatformCredentialSummary[]>;
  deletePlatformCredential(profileId: string, provider: PlatformProvider): Promise<boolean>;
}
export interface AuthenticationResult {
  readonly accessToken: string;
  readonly accountCreated: boolean;
  readonly expiresAt: string;
  readonly profile: Profile;
}

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export class StoryApplication {
  constructor(private readonly repository: StoryRepository) {}

  async signIn(input: { email: string; password: string; name?: string; language?: ProfileLanguage }): Promise<AuthenticationResult> {
    const email = normalizeEmail(input.email);
    const authentication = await this.repository.findProfileAuthenticationByEmail(email);
    if (authentication) return this.loginAuthentication(authentication, input.password);
    if (!input.name?.trim()) throw new ApplicationError("profile name is required", 422, "profile_name_required");
    return this.register({ name: input.name, email, password: input.password, ...(input.language ? { language: input.language } : {}) });
  }

  async register(input: { name: string; email: string; password: string; language?: ProfileLanguage }): Promise<AuthenticationResult> {
    const profile: ProfileAuthentication = {
      id: randomUUID(), name: input.name.trim(), email: normalizeEmail(input.email), language: input.language ?? "en",
      passwordHash: await hashPassword(input.password),
    };
    const issued = issueSession(profile.id);
    if (!await this.repository.createProfileWithSession(profile, issued.record)) {
      throw new ApplicationError("email is already registered", 409);
    }
    return {
      accessToken: issued.accessToken,
      accountCreated: true,
      expiresAt: issued.record.expiresAt.toISOString(),
      profile: publicProfile(profile),
    };
  }

  async login(input: { email: string; password: string }): Promise<AuthenticationResult> {
    const authentication = await this.repository.findProfileAuthenticationByEmail(normalizeEmail(input.email));
    if (!authentication) throw new ApplicationError("invalid email or password", 401);
    return this.loginAuthentication(authentication, input.password);
  }

  private async loginAuthentication(authentication: ProfileAuthentication, password: string): Promise<AuthenticationResult> {
    if (!await verifyPassword(password, authentication.passwordHash)) throw new ApplicationError("invalid email or password", 401);
    const issued = issueSession(authentication.id);
    await this.repository.createSession(issued.record);
    return {
      accessToken: issued.accessToken,
      accountCreated: false,
      expiresAt: issued.record.expiresAt.toISOString(),
      profile: publicProfile(authentication),
    };
  }

  async authenticate(accessToken: string): Promise<Profile> {
    if (!accessToken) throw new ApplicationError("authentication required", 401);
    const profile = await this.repository.findProfileBySession(hashToken(accessToken), new Date());
    if (!profile) throw new ApplicationError("invalid or expired access token", 401);
    return profile;
  }

  updateProfile(profileId: string, input: ProfileUpdate): Promise<Profile> {
    return this.repository.updateProfile(profileId, { ...input, ...(input.name === undefined ? {} : { name: input.name.trim() }) });
  }
  async createStory(profileId: string, input: { title: string }): Promise<StorySummary> {
    const story = createStory({ id: randomUUID(), profileId, title: input.title.trim() });
    await this.repository.createStory(story);
    return summarize(story);
  }
  async listStories(profileId: string): Promise<readonly StorySummary[]> {
    return (await this.repository.listStories(profileId)).map(summarize);
  }
  async getStory(profileId: string, storyId: string): Promise<Story> {
    const story = await this.repository.findStory(profileId, storyId);
    if (!story) throw new ApplicationError(`story not found: ${storyId}`, 404);
    return story;
  }
  async createScene(profileId: string, storyId: string): Promise<Story> {
    return this.changeStory(profileId, storyId, (story) => addScene(story, randomUUID()));
  }
  async getStoryTimeline(profileId: string, storyId: string) {
    return buildStoryTimeline(await this.getStory(profileId, storyId), timelineDurationLimits);
  }
  async reorderStoryScenes(profileId: string, storyId: string, sceneIds: readonly string[], expectedRevision: number): Promise<Story> {
    const story = await this.getEditableTimelineStory(profileId, storyId, expectedRevision);
    return this.saveTimelineChange(() => reorderScenes(story, sceneIds));
  }
  async moveSceneMaterials(profileId: string, storyId: string, sourceSceneId: string, input: MoveSceneMaterialsInput & {
    readonly expectedRevision: number;
  }): Promise<Story> {
    const story = await this.getEditableTimelineStory(profileId, storyId, input.expectedRevision);
    const source = story.scenes.find(({ id }) => id === sourceSceneId);
    if (!source || !story.scenes.some(({ id }) => id === input.targetSceneId)) {
      throw new ApplicationError("source or target scene not found in this story", 404, "scene_not_found");
    }
    if (input.materialIds.some((id) => !source.materials.some((material) => material.id === id))) {
      throw new ApplicationError("material not found in source scene", 404, "material_not_found");
    }
    return this.saveTimelineChange(() => moveSceneMaterials(story, sourceSceneId, input));
  }
  async deleteScene(profileId: string, storyId: string, sceneId: string, expectedRevision?: number): Promise<Story> {
    const story = await this.getStory(profileId, storyId);
    const scene = story.scenes.find(({ id }) => id === sceneId);
    if (!scene) throw new ApplicationError(`scene not found: ${sceneId}`, 404, "scene_not_found");
    if (expectedRevision !== undefined && expectedRevision !== story.revision) {
      throw new ApplicationError("story has changed; reload it before deleting the scene", 409, "story_revision_conflict");
    }
    if (story.status !== "draft" && story.status !== "ready") {
      throw new ApplicationError(`story cannot be edited while ${story.status}`, 409, "story_not_editable");
    }
    const changed = removeScene(story, sceneId);
    const retainedKeys = new Set(changed.scenes.flatMap(sceneStoredMaterials).flatMap(materialStorageKeys));
    const storageKeys = [...new Set(sceneStoredMaterials(scene).flatMap(materialStorageKeys))].filter((key) => !retainedKeys.has(key));
    await this.repository.deleteScene(changed, sceneId, storageKeys);
    return changed;
  }
  async addSceneMaterial(profileId: string, storyId: string, sceneId: string, material: NewSceneMaterial): Promise<Story> {
    return this.changeStory(profileId, storyId, (story) => addMaterial(story, sceneId, { ...material, id: randomUUID() } as SceneMaterial));
  }
  async removeSceneMaterial(profileId: string, storyId: string, sceneId: string, materialId: string): Promise<{
    readonly story: Story;
    readonly material: SceneMaterial;
  }> {
    const story = await this.getStory(profileId, storyId);
    const scene = story.scenes.find(({ id }) => id === sceneId);
    if (!scene) throw new ApplicationError(`scene not found: ${sceneId}`, 404);
    const material = scene.materials.find(({ id }) => id === materialId);
    if (!material) throw new ApplicationError(`material not found: ${materialId}`, 404);
    const changed = removeMaterial(story, sceneId, materialId);
    await this.repository.updateStory(changed);
    return { story: changed, material };
  }
  async replaceSceneMaterial(profileId: string, storyId: string, sceneId: string, material: SceneMaterial): Promise<Story> {
    return this.changeStory(profileId, storyId, (story) => replaceMaterial(story, sceneId, material));
  }
  async reorderSceneMaterials(profileId: string, storyId: string, sceneId: string, materialIds: readonly string[]): Promise<Story> {
    return this.changeStory(profileId, storyId, (story) => reorderMaterials(story, sceneId, materialIds));
  }
  async configureScene(profileId: string, storyId: string, sceneId: string, input: {
    durationSeconds?: number; layoutId?: string | null; motion?: SceneMotion; focusPoint?: FocusPoint; collage?: EditableCollageSettings;
  }): Promise<Story> {
    return this.changeStory(profileId, storyId, (story) => configureScene(story, sceneId, input));
  }
  async setSceneCollageBackground(
    profileId: string,
    storyId: string,
    sceneId: string,
    background: { readonly source: "previous-scene" } | { readonly source: "material"; readonly material: NewSceneMaterial },
  ): Promise<{ readonly story: Story; readonly replacedMaterial?: SceneMaterial }> {
    const story = await this.getStory(profileId, storyId);
    const scene = story.scenes.find(({ id }) => id === sceneId);
    if (!scene) throw new ApplicationError(`scene not found: ${sceneId}`, 404, "scene_not_found");
    const replacedMaterial = scene.collageBackground?.source === "material"
      ? scene.collageBackground.material
      : undefined;
    const resolved = background.source === "material"
      ? { source: "material" as const, material: { ...background.material, id: randomUUID() } as SceneMaterial }
      : background;
    let changed: Story;
    try {
      changed = setCollageBackground(story, sceneId, resolved);
    } catch (error) {
      if (error instanceof DomainError) throw new ApplicationError(error.message, 422, "invalid_collage_background");
      throw error;
    }
    await this.repository.updateStory(changed);
    return { story: changed, ...(replacedMaterial ? { replacedMaterial } : {}) };
  }
  setPlatformCredential(profileId: string, input: { provider: PlatformProvider; secret: string; externalAccountId?: string }): Promise<PlatformCredentialSummary> {
    return this.repository.upsertPlatformCredential({
      id: randomUUID(), profileId, provider: input.provider, secret: input.secret,
      ...(input.externalAccountId === undefined ? {} : { externalAccountId: input.externalAccountId.trim() }),
    });
  }
  listPlatformCredentials(profileId: string): Promise<readonly PlatformCredentialSummary[]> {
    return this.repository.listPlatformCredentials(profileId);
  }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider): Promise<void> {
    if (!await this.repository.deletePlatformCredential(profileId, provider)) {
      throw new ApplicationError(`platform credential not found: ${provider}`, 404);
    }
  }

  private async changeStory(profileId: string, storyId: string, change: (story: Story) => Story): Promise<Story> {
    const story = await this.repository.findStory(profileId, storyId);
    if (!story) throw new ApplicationError(`story not found: ${storyId}`, 404);
    const changed = change(story);
    await this.repository.updateStory(changed);
    return changed;
  }

  private async getEditableTimelineStory(profileId: string, storyId: string, expectedRevision: number): Promise<Story> {
    const story = await this.getStory(profileId, storyId);
    if (story.revision !== expectedRevision) {
      throw new ApplicationError("story has changed; reload it before editing the timeline", 409, "story_revision_conflict");
    }
    if (story.status !== "draft" && story.status !== "ready") {
      throw new ApplicationError(`story cannot be edited while ${story.status}`, 409, "story_not_editable");
    }
    return story;
  }

  private async saveTimelineChange(change: () => Story): Promise<Story> {
    let changed: Story;
    try { changed = change(); }
    catch (error) {
      if (error instanceof DomainError) throw new ApplicationError(error.message, 422, "invalid_timeline_edit");
      throw error;
    }
    // The repository's compare-and-swap protects the gap between read and write.
    await this.repository.updateStory(changed);
    return changed;
  }
}

function sceneStoredMaterials(scene: Scene): readonly SceneMaterial[] {
  return scene.collageBackground?.source === "material"
    ? [...scene.materials, scene.collageBackground.material]
    : scene.materials;
}

export class ApplicationError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code?: string) { super(message); }
}

function summarize(story: Story): StorySummary {
  return { id: story.id, profileId: story.profileId, ...(story.title === undefined ? {} : { title: story.title }), status: story.status, sceneCount: story.scenes.length, revision: story.revision };
}
function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
function issueSession(profileId: string): { accessToken: string; record: SessionRecord } {
  const accessToken = randomBytes(32).toString("base64url");
  return { accessToken, record: { profileId, tokenHash: hashToken(accessToken), expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS) } };
}
function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await derivePassword(password, Buffer.from(saltValue, "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
}
function publicProfile(profile: ProfileAuthentication): Profile {
  return { id: profile.id, name: profile.name, email: profile.email, language: profile.language };
}
