import { createCipheriv, randomBytes } from "node:crypto";
import {
  clampSceneTitleToDuration, collageCardMaterials, createCollageCardAngles, createCollageCardOffsets, createDefaultSceneTitle,
  defaultStoryFrameRate, getAutomaticCollageLayout, getSelectedCollageLayout, hasCompleteCollageCardAngles,
  hasCompleteCollageCardOffsets, normalizeFrameRate, resolveCollageSettings, type PlatformCredential, type PlatformProvider,
  type Profile, type ProfileUpdate, type SceneMaterial, type SceneTitle, type Story,
} from "@storyteller/domain";
import {
  ApplicationError,
  type AuthenticatedSession,
  type PlatformCredentialSummary,
  type ProductActivityRecord,
  type ProfileAuthentication,
  type SessionRecord,
  type StoryRepository,
} from "@storyteller/application";
import { sceneMaterialSchema, sceneTitleSchema, storySchema } from "@storyteller/schemas";
import { Pool, type PoolClient } from "pg";

export class PostgresStoryRepository implements StoryRepository {
  constructor(private readonly pool: Pool, private readonly credentialKey: Buffer) {
    if (credentialKey.length !== 32) throw new Error("PLATFORM_CREDENTIALS_KEY must decode to exactly 32 bytes");
  }

  async createProfileWithSession(profile: ProfileAuthentication, session: SessionRecord): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO profiles (id, name, email, language, password_hash) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [profile.id, profile.name, profile.email, profile.language, profile.passwordHash],
      );
      if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
      await insertSession(client, session);
      await insertActivity(client, profile.id, { code: "auth.registered", dedupeKey: `auth.registered:${profile.id}` });
      await insertActivity(client, profile.id, { code: "auth.logged_in", dedupeKey: `auth.logged_in:${session.id}` });
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async findProfileAuthenticationByEmail(email: string): Promise<ProfileAuthentication | undefined> {
    const result = await this.pool.query<ProfileRow & { password_hash: string }>(
      "SELECT id, name, email, language, password_hash FROM profiles WHERE email = $1", [email],
    );
    const row = result.rows[0];
    return row && { ...mapProfile(row), passwordHash: row.password_hash };
  }
  async createSession(session: SessionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await insertSession(client, session);
      await insertActivity(client, session.profileId, { code: "auth.logged_in", dedupeKey: `auth.logged_in:${session.id}` });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async findSessionByTokenHash(tokenHash: string, now: Date): Promise<AuthenticatedSession | undefined> {
    const result = await this.pool.query<ProfileRow & { session_id: string; expires_at: Date | string }>(
      `SELECT p.id, p.name, p.email, p.language, s.id AS session_id, s.expires_at
       FROM sessions s JOIN profiles p ON p.id = s.profile_id
       WHERE s.token_hash = $1 AND s.expires_at > $2 AND s.revoked_at IS NULL`, [tokenHash, now],
    );
    const row = result.rows[0];
    return row && { id: row.session_id, profile: mapProfile(row), expiresAt: toIso(row.expires_at) };
  }
  async rotateSession(oldTokenHash: string, session: SessionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const revoked = await client.query(
        "UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING profile_id",
        [oldTokenHash],
      );
      if (revoked.rowCount !== 1) throw new ApplicationError("invalid or expired access token", 401);
      await insertSession(client, session);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async revokeSession(tokenHash: string, now: Date): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id",
      [tokenHash, now],
    );
    return result.rowCount === 1;
  }
  async touchSession(sessionId: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET last_seen_at = $2
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > $2 AND last_seen_at < $2 - interval '5 minutes'`,
      [sessionId, now],
    );
  }
  async updateProfile(profileId: string, input: ProfileUpdate): Promise<Profile> {
    const result = await this.pool.query<ProfileRow>(
      `UPDATE profiles SET name = COALESCE($2, name), language = COALESCE($3, language), updated_at = now()
       WHERE id = $1 RETURNING id, name, email, language`, [profileId, input.name ?? null, input.language ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new ApplicationError("profile not found", 404);
    return mapProfile(row);
  }
  async createStory(story: Story): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO stories (id, profile_id, title, status, scene_count, revision, payload) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [story.id, story.profileId, story.title ?? null, story.status, story.scenes.length, story.revision, story],
      );
      await insertActivity(client, story.profileId, { code: "story.created", dedupeKey: `story.created:${story.id}` });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async listStories(profileId: string): Promise<readonly Story[]> {
    const result = await this.pool.query<{ payload: unknown }>("SELECT payload FROM stories WHERE profile_id = $1 ORDER BY created_at", [profileId]);
    return result.rows.map(({ payload }) => normalizeStoredStory(payload));
  }
  async findStory(profileId: string, storyId: string): Promise<Story | undefined> {
    const result = await this.pool.query<{ payload: unknown }>("SELECT payload FROM stories WHERE id = $1 AND profile_id = $2", [storyId, profileId]);
    const payload = result.rows[0]?.payload;
    return payload === undefined ? undefined : normalizeStoredStory(payload);
  }
  async updateStory(story: Story, activity?: ProductActivityRecord): Promise<void> {
    if (!activity) return persistStoryRevision(this.pool, story);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await persistStoryRevision(client, story);
      await insertActivity(client, story.profileId, activity);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async deleteScene(story: Story, sceneId: string, storageKeys: readonly string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Lock/update the story first: stale saves must not resurrect the deleted scene.
      await persistStoryRevision(client, story);
      await client.query(
        `WITH removed_renders AS (
           DELETE FROM scene_renders WHERE story_id = $1 AND scene_id = $2 RETURNING storage_key
         )
         INSERT INTO object_deletion_jobs (storage_key)
         SELECT DISTINCT storage_key FROM removed_renders WHERE storage_key IS NOT NULL
         ON CONFLICT (storage_key) DO UPDATE SET status = 'queued', attempts = 0, worker_id = NULL,
           locked_until = NULL, error = NULL, updated_at = now()`,
        [story.id, sceneId],
      );
      await client.query(
        `INSERT INTO object_deletion_jobs (storage_key)
         SELECT DISTINCT unnest($1::text[])
         ON CONFLICT (storage_key) DO UPDATE SET status = 'queued', attempts = 0, worker_id = NULL,
           locked_until = NULL, error = NULL, updated_at = now()`,
        [storageKeys],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async upsertPlatformCredential(credential: PlatformCredential): Promise<PlatformCredentialSummary> {
    const encrypted = encryptSecret(credential.secret, this.credentialKey);
    const hint = credential.secret.length <= 4 ? "••••" : `••••${credential.secret.slice(-4)}`;
    const result = await this.pool.query<CredentialRow>(
      `INSERT INTO platform_credentials (id, profile_id, provider, external_account_id, encrypted_secret, secret_hint)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (profile_id, provider) DO UPDATE SET external_account_id = EXCLUDED.external_account_id,
       encrypted_secret = EXCLUDED.encrypted_secret, secret_hint = EXCLUDED.secret_hint, updated_at = now()
       RETURNING id, provider, external_account_id, secret_hint`,
      [credential.id, credential.profileId, credential.provider, credential.externalAccountId ?? null, encrypted, hint],
    );
    return mapCredential(result.rows[0]!);
  }
  async listPlatformCredentials(profileId: string): Promise<readonly PlatformCredentialSummary[]> {
    const result = await this.pool.query<CredentialRow>(
      "SELECT id, provider, external_account_id, secret_hint FROM platform_credentials WHERE profile_id = $1 ORDER BY provider", [profileId],
    );
    return result.rows.map(mapCredential);
  }
  async deletePlatformCredential(profileId: string, provider: PlatformProvider): Promise<boolean> {
    return (await this.pool.query("DELETE FROM platform_credentials WHERE profile_id = $1 AND provider = $2", [profileId, provider])).rowCount === 1;
  }
}

async function persistStoryRevision(client: Pick<Pool | PoolClient, "query">, story: Story): Promise<void> {
  const result = await client.query(
    `UPDATE stories SET status = $2, scene_count = $3, revision = $4, payload = $5
     WHERE id = $1 AND profile_id = $6 AND revision = $7`,
    [story.id, story.status, story.scenes.length, story.revision, story, story.profileId, story.revision - 1],
  );
  if (result.rowCount === 1) return;
  const existing = await client.query("SELECT id FROM stories WHERE id = $1 AND profile_id = $2", [story.id, story.profileId]);
  if (!existing.rowCount) throw new ApplicationError(`story not found: ${story.id}`, 404);
  throw new ApplicationError("story has changed; reload it before saving", 409, "story_revision_conflict");
}

/**
 * Stories created by the old mock editor may contain material placeholders with
 * no backing file. Keep their scenes, but do not expose those placeholders as
 * uploaded media. A later story mutation persists the normalized payload.
 */
export function normalizeStoredStory(payload: unknown): Story {
  if (!isRecord(payload) || !Array.isArray(payload.scenes)) return withStoredCollageComposition(storySchema.parse(payload) as Story);
  const scenes = payload.scenes.map((scene) => {
    if (!isRecord(scene) || !Array.isArray(scene.materials)) return scene;
    let materials = scene.materials.filter((material) => {
      const parsed = sceneMaterialSchema.safeParse(material);
      if (parsed.success) return true;
      if (isRecord(material) && typeof material.storageKey === "string" && material.storageKey.length > 0) {
        sceneMaterialSchema.parse(material);
      }
      return false;
    });
    const legacyCollage = isRecord(scene.collage) ? scene.collage : undefined;
    const legacyBackground = legacyCollage && isRecord(legacyCollage.background) ? legacyCollage.background : undefined;
    let collageBackground = scene.collageBackground;
    if (scene.rendererId === "collage" && collageBackground === undefined) {
      if (legacyBackground?.mode === "first-material" && materials[0]) {
        collageBackground = { source: "material", material: materials[0] };
        materials = materials.slice(1);
      } else {
        collageBackground = { source: "previous-scene" };
      }
    }
    const singleImageRenderer = (scene.rendererId === undefined || scene.rendererId === "still-image") && materials.length === 1
      && isRecord(materials[0]) && materials[0].kind === "image";
    const { focusPoint: oldFocusPoint, ...withoutFocus } = scene;
    const withRendererFocus = singleImageRenderer
      ? { ...withoutFocus, rendererId: "still-image", focusPoint: oldFocusPoint ?? { x: 0.5, y: 0.5 } }
      : withoutFocus;
    const withBackground = collageBackground === undefined ? withRendererFocus : { ...withRendererFocus, collageBackground };
    if (materials.length === scene.materials.length) return withNormalizedStoredTitle(withBackground, materials);
    const { layoutId: _legacyLayout, ...withoutLayout } = withRendererFocus;
    return withNormalizedStoredTitle({ ...withoutLayout, collageBackground, materials, render: { status: "idle" } }, materials);
  });
  return withStoredCollageComposition(storySchema.parse({ ...payload, scenes }) as Story);
}

function withNormalizedStoredTitle(scene: Record<string, unknown>, materials: readonly SceneMaterial[]): Record<string, unknown> {
  const rawTitle = scene.title;
  if (rawTitle === undefined) return scene;
  const durationSeconds = storedSceneDurationSeconds(scene, materials);
  const title = !materials.length || durationSeconds <= 0 ? undefined : typeof rawTitle === "string"
    ? rawTitle.trim() ? createDefaultSceneTitle(rawTitle, durationSeconds) : undefined
    : (() => {
        const parsed = sceneTitleSchema.parse(rawTitle) as SceneTitle;
        return clampSceneTitleToDuration(parsed, durationSeconds);
      })();
  const { title: _title, ...withoutTitle } = scene;
  return title ? { ...withoutTitle, title } : withoutTitle;
}

function storedSceneDurationSeconds(scene: Record<string, unknown>, materials: readonly SceneMaterial[]): number {
  const material = materials[0];
  if (materials.length === 1 && material?.kind === "video") {
    return material.edit?.trim ? material.edit.trim.endSeconds - material.edit.trim.startSeconds : material.sourceDurationSeconds;
  }
  return typeof scene.durationSeconds === "number" ? scene.durationSeconds : 0;
}

function withStoredCollageComposition(story: Story): Story {
  const firstVideo = story.scenes.flatMap(({ materials }) => materials).find((material) => material.kind === "video");
  return {
    ...story,
    ...(story.outputFrameRate || !firstVideo
      ? {}
      : { outputFrameRate: firstVideo.sourceFrameRate ? normalizeFrameRate(firstVideo.sourceFrameRate) : defaultStoryFrameRate }),
    scenes: story.scenes.map((scene) => {
      if (!scene.collage) return scene;
      const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
      const cards = collageCardMaterials(scene.materials, settings);
      const storedLayout = getSelectedCollageLayout(cards, scene.layoutId);
      const repairedLayout = !storedLayout && scene.layoutId
        ? getAutomaticCollageLayout(cards)
        : undefined;
      const layout = storedLayout ?? repairedLayout;
      if (!layout) {
        if (!scene.layoutId) return { ...scene, collage: settings };
        const { layoutId: _staleLayoutId, ...withoutStaleLayout } = scene;
        return { ...withoutStaleLayout, collage: { ...settings, cardAngles: [], cardOffsets: [] }, render: { status: "idle" } };
      }
      const normalizedScene = repairedLayout
        ? { ...scene, layoutId: repairedLayout.id, render: { status: "idle" as const } }
        : scene;
      if (!repairedLayout && hasCompleteCollageCardAngles(scene.materials, settings)
        && hasCompleteCollageCardOffsets(scene.materials, settings, layout.rowSizes)) {
        return { ...normalizedScene, collage: settings };
      }
      return {
        ...normalizedScene,
        collage: {
          ...settings,
          cardAngles: createCollageCardAngles({
            layoutId: layout.id,
            materials: cards,
            straightCards: settings.straightCards,
            seedKey: `stored:${story.id}:${scene.id}`,
          }),
          cardOffsets: createCollageCardOffsets({
            layoutId: layout.id,
            materials: cards,
            direction: settings.rowDirection,
            seedKey: `stored:${story.id}:${scene.id}:offsets`,
          }),
        },
      };
    }),
  };
}

export function createPostgresRepository(): { pool: Pool; repository: PostgresStoryRepository } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const keyValue = process.env.PLATFORM_CREDENTIALS_KEY;
  if (!keyValue) throw new Error("PLATFORM_CREDENTIALS_KEY is required");
  const pool = new Pool({ connectionString, ssl: process.env.PGSSLMODE === "disable" ? false : undefined });
  return { pool, repository: new PostgresStoryRepository(pool, Buffer.from(keyValue, "base64")) };
}

async function insertSession(client: Pick<Pool | PoolClient, "query">, session: SessionRecord): Promise<void> {
  await client.query(
    "INSERT INTO sessions (id, token_hash, profile_id, expires_at) VALUES ($1, $2, $3, $4)",
    [session.id, session.tokenHash, session.profileId, session.expiresAt],
  );
}
async function insertActivity(
  client: Pick<Pool | PoolClient, "query">,
  profileId: string,
  activity: ProductActivityRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO product_activity_events (profile_id, code, dedupe_key) VALUES ($1, $2, $3)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [profileId, activity.code, activity.dedupeKey],
  );
}
function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
interface ProfileRow { id: string; name: string; email: string; language: Profile["language"] }
interface CredentialRow { id: string; provider: PlatformProvider; external_account_id: string | null; secret_hint: string }
function mapProfile(row: ProfileRow): Profile { return { id: row.id, name: row.name, email: row.email, language: row.language }; }
function toIso(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function mapCredential(row: CredentialRow): PlatformCredentialSummary {
  return { id: row.id, provider: row.provider, secretHint: row.secret_hint, ...(row.external_account_id === null ? {} : { externalAccountId: row.external_account_id }) };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
