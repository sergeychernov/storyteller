import type { Pool } from "pg";

const migrations = [{
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
    await client.query("SELECT pg_advisory_unlock(813791234)");
    client.release();
  }
}
