import { createCipheriv, randomBytes } from "node:crypto";
import type { PlatformCredential, PlatformProvider, Profile, Story } from "@storyteller/domain";
import { ApplicationError, type PlatformCredentialSummary, type ProfileAuthentication, type SessionRecord, type StoryRepository } from "@storyteller/application";
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
        `INSERT INTO profiles (id, name, email, password_hash) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [profile.id, profile.name, profile.email, profile.passwordHash],
      );
      if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
      await insertSession(client, session);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async findProfileAuthenticationByEmail(email: string): Promise<ProfileAuthentication | undefined> {
    const result = await this.pool.query<ProfileRow & { password_hash: string }>(
      "SELECT id, name, email, password_hash FROM profiles WHERE email = $1", [email],
    );
    const row = result.rows[0];
    return row && { ...mapProfile(row), passwordHash: row.password_hash };
  }
  async createSession(session: SessionRecord): Promise<void> { await insertSession(this.pool, session); }
  async findProfileBySession(tokenHash: string, now: Date): Promise<Profile | undefined> {
    const result = await this.pool.query<ProfileRow>(
      `SELECT p.id, p.name, p.email FROM sessions s JOIN profiles p ON p.id = s.profile_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`, [tokenHash, now],
    );
    return result.rows[0] && mapProfile(result.rows[0]);
  }
  async updateProfile(profileId: string, name: string): Promise<Profile> {
    const result = await this.pool.query<ProfileRow>(
      "UPDATE profiles SET name = $2, updated_at = now() WHERE id = $1 RETURNING id, name, email", [profileId, name],
    );
    const row = result.rows[0];
    if (!row) throw new ApplicationError("profile not found", 404);
    return mapProfile(row);
  }
  async createStory(story: Story): Promise<void> {
    await this.pool.query(
      "INSERT INTO stories (id, profile_id, title, status, scene_count, revision, payload) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [story.id, story.profileId, story.title ?? null, story.status, story.scenes.length, story.revision, story],
    );
  }
  async listStories(profileId: string): Promise<readonly Story[]> {
    const result = await this.pool.query<{ payload: Story }>("SELECT payload FROM stories WHERE profile_id = $1 ORDER BY created_at", [profileId]);
    return result.rows.map(({ payload }) => payload);
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

export function createPostgresRepository(): { pool: Pool; repository: PostgresStoryRepository } {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const keyValue = process.env.PLATFORM_CREDENTIALS_KEY;
  if (!keyValue) throw new Error("PLATFORM_CREDENTIALS_KEY is required");
  const pool = new Pool({ connectionString, ssl: process.env.PGSSLMODE === "disable" ? false : undefined });
  return { pool, repository: new PostgresStoryRepository(pool, Buffer.from(keyValue, "base64")) };
}

async function insertSession(client: Pick<Pool | PoolClient, "query">, session: SessionRecord): Promise<void> {
  await client.query("INSERT INTO sessions (token_hash, profile_id, expires_at) VALUES ($1, $2, $3)", [session.tokenHash, session.profileId, session.expiresAt]);
}
function encryptSecret(secret: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
interface ProfileRow { id: string; name: string; email: string }
interface CredentialRow { id: string; provider: PlatformProvider; external_account_id: string | null; secret_hint: string }
function mapProfile(row: ProfileRow): Profile { return { id: row.id, name: row.name, email: row.email }; }
function mapCredential(row: CredentialRow): PlatformCredentialSummary {
  return { id: row.id, provider: row.provider, secretHint: row.secret_hint, ...(row.external_account_id === null ? {} : { externalAccountId: row.external_account_id }) };
}
