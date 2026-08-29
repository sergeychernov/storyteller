import type { Pool } from "pg";

export const migrations = [{
  version: 1,
  sql: `
    CREATE TABLE profiles (
      id uuid PRIMARY KEY, name varchar(80) NOT NULL, email varchar(254) NOT NULL UNIQUE,
      password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE sessions (
      token_hash char(64) PRIMARY KEY, profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX sessions_profile_id_idx ON sessions(profile_id);
    CREATE TABLE projects (
      id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name varchar(100) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX projects_profile_id_idx ON projects(profile_id);
    CREATE TABLE stories (
      id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title varchar(120), status varchar(20) NOT NULL, scene_count integer NOT NULL DEFAULT 0,
      revision integer NOT NULL DEFAULT 1, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX stories_project_id_idx ON stories(project_id);
    CREATE TABLE platform_credentials (
      id uuid PRIMARY KEY, profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      provider varchar(20) NOT NULL CHECK (provider IN ('telegram', 'tiktok', 'instagram')),
      external_account_id varchar(255), encrypted_secret text NOT NULL, secret_hint varchar(20) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(profile_id, provider)
    );
  `,
}, {
  version: 2,
  sql: `
    ALTER TABLE stories ADD COLUMN profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE;
    UPDATE stories s
    SET profile_id = p.profile_id,
        payload = (s.payload - 'projectId') || jsonb_build_object('profileId', p.profile_id::text)
    FROM projects p
    WHERE s.project_id = p.id;
    ALTER TABLE stories ALTER COLUMN profile_id SET NOT NULL;
    CREATE INDEX stories_profile_id_idx ON stories(profile_id);
    ALTER TABLE stories DROP COLUMN project_id;
    DROP TABLE projects;
  `,
}, {
  version: 3,
  sql: `
    CREATE TABLE scene_renders (
      id uuid PRIMARY KEY,
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      scene_id uuid NOT NULL,
      input_hash char(64) NOT NULL,
      input jsonb NOT NULL,
      status varchar(20) NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed', 'canceled')),
      storage_key text,
      size_bytes bigint,
      error text,
      attempts integer NOT NULL DEFAULT 0,
      worker_id text,
      locked_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (story_id, scene_id, input_hash)
    );
    CREATE INDEX scene_renders_queue_idx ON scene_renders(status, locked_until, created_at);
    CREATE INDEX scene_renders_scene_idx ON scene_renders(story_id, scene_id);

    CREATE TABLE object_deletion_jobs (
      storage_key text PRIMARY KEY,
      status varchar(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'failed')),
      attempts integer NOT NULL DEFAULT 0,
      worker_id text,
      locked_until timestamptz,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX object_deletion_jobs_queue_idx ON object_deletion_jobs(status, locked_until, created_at);
  `,
}, {
  version: 4,
  sql: `ALTER TABLE scene_renders ADD COLUMN content_hash char(64)
    CHECK (content_hash ~ '^[a-f0-9]{64}$');`,
}, {
  version: 5,
  sql: `ALTER TABLE profiles ADD COLUMN language varchar(20) NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'ru', 'sr-Latn', 'es'));`,
}];

export async function migrateDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(813791234)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const applied = new Set((await client.query<{ version: number }>("SELECT version FROM schema_migrations")).rows.map(({ version }) => version));
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(813791234)"); }
    finally { client.release(); }
  }
}
