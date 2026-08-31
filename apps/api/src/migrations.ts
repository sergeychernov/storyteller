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
}, {
  version: 6,
  sql: `
    CREATE TABLE access_capabilities (
      code text PRIMARY KEY,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE access_limit_definitions (
      code text PRIMARY KEY,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE access_roles (
      code text PRIMARY KEY,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE access_role_capabilities (
      role_code text NOT NULL REFERENCES access_roles(code),
      capability_code text NOT NULL REFERENCES access_capabilities(code),
      PRIMARY KEY (role_code, capability_code)
    );
    CREATE TABLE access_plan_versions (
      code text PRIMARY KEY,
      plan_key text NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      locked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (plan_key, version)
    );
    CREATE TABLE access_cohorts (
      code text PRIMARY KEY,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO access_capabilities (code) VALUES
      ('admin.console.access'),
      ('admin.users.list'),
      ('admin.users.read'),
      ('admin.users.activity.read'),
      ('admin.sessions.metadata.read'),
      ('admin.audit.read'),
      ('admin.access.explain'),
      ('admin.permissions.read'),
      ('admin.roles.read'),
      ('admin.cohorts.read'),
      ('admin.access.assign_role'),
      ('admin.access.assign_cohort'),
      ('admin.access.override'),
      ('admin.sessions.revoke'),
      ('studio.access'),
      ('story.list'),
      ('story.create'),
      ('story.read'),
      ('story.update'),
      ('story.delete'),
      ('media.upload'),
      ('scene.render'),
      ('story.export'),
      ('profile.platform_credentials.manage'),
      ('publish.youtube'),
      ('studio.timeline.access'),
      ('studio.collage.access'),
      ('studio.custom_layout.access'),
      ('studio.scene_groups.access'),
      ('mobile.access'),
      ('mcp.access'),
      ('ai.story_assist.use'),
      ('ai.music.generate'),
      ('ai.cover.generate'),
      ('developer.diagnostics.read');
    INSERT INTO access_limit_definitions (code) VALUES
      ('limit.stories.active'),
      ('limit.storage.bytes'),
      ('limit.scene_renders.month'),
      ('limit.story_exports.month'),
      ('limit.ai.credits.month');
    INSERT INTO access_roles (code) VALUES ('creator'), ('access_manager');
    INSERT INTO access_role_capabilities (role_code, capability_code)
    SELECT 'creator', code FROM access_capabilities WHERE code IN (
      'studio.access', 'story.list', 'story.create', 'story.read', 'story.update', 'story.delete',
      'media.upload', 'scene.render', 'story.export', 'profile.platform_credentials.manage', 'publish.youtube'
    );
    INSERT INTO access_role_capabilities (role_code, capability_code)
    SELECT 'access_manager', code FROM access_capabilities WHERE code LIKE 'admin.%';
    INSERT INTO access_plan_versions (code, plan_key, version, locked_at) VALUES
      ('free-v1', 'free', 1, now()),
      ('creator-v1', 'creator', 1, now()),
      ('studio-v1', 'studio', 1, now());
    INSERT INTO access_cohorts (code) VALUES ('testers'), ('early_users'), ('ambassadors'), ('developers');

    ALTER TABLE profiles ADD COLUMN access_plan_version_code text NOT NULL DEFAULT 'free-v1'
      REFERENCES access_plan_versions(code);
    CREATE INDEX profiles_access_plan_version_idx ON profiles(access_plan_version_code);

    CREATE TABLE access_cohort_memberships (
      profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      cohort_code text NOT NULL REFERENCES access_cohorts(code),
      starts_at timestamptz,
      expires_at timestamptz,
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (profile_id, cohort_code),
      CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
    );
    CREATE INDEX access_cohort_memberships_cohort_idx ON access_cohort_memberships(cohort_code);

    CREATE TABLE access_role_assignments (
      id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      plan_version_code text REFERENCES access_plan_versions(code),
      cohort_code text REFERENCES access_cohorts(code),
      profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      role_code text NOT NULL REFERENCES access_roles(code),
      starts_at timestamptz,
      expires_at timestamptz,
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(plan_version_code, cohort_code, profile_id) = 1),
      CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
    );
    CREATE INDEX access_role_assignments_plan_idx ON access_role_assignments(plan_version_code);
    CREATE INDEX access_role_assignments_cohort_idx ON access_role_assignments(cohort_code);
    CREATE INDEX access_role_assignments_profile_idx ON access_role_assignments(profile_id);

    CREATE TABLE access_capability_assignments (
      id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      plan_version_code text REFERENCES access_plan_versions(code),
      cohort_code text REFERENCES access_cohorts(code),
      profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      capability_code text NOT NULL REFERENCES access_capabilities(code),
      effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
      starts_at timestamptz,
      expires_at timestamptz,
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(plan_version_code, cohort_code, profile_id) = 1),
      CHECK (plan_version_code IS NULL OR effect = 'allow'),
      CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
    );
    CREATE INDEX access_capability_assignments_plan_idx ON access_capability_assignments(plan_version_code);
    CREATE INDEX access_capability_assignments_cohort_idx ON access_capability_assignments(cohort_code);
    CREATE INDEX access_capability_assignments_profile_idx ON access_capability_assignments(profile_id);

    CREATE TABLE access_limit_assignments (
      id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      plan_version_code text REFERENCES access_plan_versions(code),
      cohort_code text REFERENCES access_cohorts(code),
      profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
      limit_code text NOT NULL REFERENCES access_limit_definitions(code),
      operation text NOT NULL CHECK (operation IN ('base', 'add', 'replace')),
      value bigint,
      unlimited boolean NOT NULL DEFAULT false,
      starts_at timestamptz,
      expires_at timestamptz,
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (num_nonnulls(plan_version_code, cohort_code, profile_id) = 1),
      CHECK ((unlimited AND value IS NULL) OR (NOT unlimited AND value IS NOT NULL AND value >= 0)),
      CHECK ((plan_version_code IS NULL AND operation IN ('add', 'replace')) OR (plan_version_code IS NOT NULL AND operation = 'base')),
      CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
    );
    CREATE INDEX access_limit_assignments_plan_idx ON access_limit_assignments(plan_version_code);
    CREATE INDEX access_limit_assignments_cohort_idx ON access_limit_assignments(cohort_code);
    CREATE INDEX access_limit_assignments_profile_idx ON access_limit_assignments(profile_id);

    CREATE TABLE access_operational_switches (
      capability_code text PRIMARY KEY REFERENCES access_capabilities(code),
      disabled boolean NOT NULL DEFAULT false,
      reason text NOT NULL CHECK (length(btrim(reason)) > 0),
      updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE access_audit_log (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
      action text NOT NULL,
      entity_type text NOT NULL,
      entity_key text NOT NULL,
      reason text NOT NULL,
      old_data jsonb,
      new_data jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX access_audit_log_created_idx ON access_audit_log(created_at DESC);
    CREATE INDEX access_audit_log_actor_idx ON access_audit_log(actor_profile_id, created_at DESC);

    INSERT INTO access_role_assignments (plan_version_code, role_code, reason) VALUES
      ('free-v1', 'creator', 'baseline plan fixture'),
      ('creator-v1', 'creator', 'creator plan fixture'),
      ('studio-v1', 'creator', 'studio plan fixture');
    INSERT INTO access_capability_assignments (plan_version_code, capability_code, effect, reason) VALUES
      ('studio-v1', 'ai.story_assist.use', 'allow', 'studio plan fixture'),
      ('studio-v1', 'ai.music.generate', 'allow', 'studio plan fixture'),
      ('studio-v1', 'ai.cover.generate', 'allow', 'studio plan fixture');
    INSERT INTO access_limit_assignments (plan_version_code, limit_code, operation, value, reason) VALUES
      ('free-v1', 'limit.stories.active', 'base', 3, 'baseline plan fixture'),
      ('free-v1', 'limit.storage.bytes', 'base', 2147483648, 'baseline plan fixture'),
      ('free-v1', 'limit.scene_renders.month', 'base', 20, 'baseline plan fixture'),
      ('free-v1', 'limit.story_exports.month', 'base', 3, 'baseline plan fixture'),
      ('free-v1', 'limit.ai.credits.month', 'base', 0, 'baseline plan fixture'),
      ('creator-v1', 'limit.stories.active', 'base', 50, 'creator plan fixture'),
      ('creator-v1', 'limit.storage.bytes', 'base', 53687091200, 'creator plan fixture'),
      ('creator-v1', 'limit.scene_renders.month', 'base', 300, 'creator plan fixture'),
      ('creator-v1', 'limit.story_exports.month', 'base', 60, 'creator plan fixture'),
      ('creator-v1', 'limit.ai.credits.month', 'base', 0, 'creator plan fixture'),
      ('studio-v1', 'limit.stories.active', 'base', 500, 'studio plan fixture'),
      ('studio-v1', 'limit.storage.bytes', 'base', 536870912000, 'studio plan fixture'),
      ('studio-v1', 'limit.scene_renders.month', 'base', 2000, 'studio plan fixture'),
      ('studio-v1', 'limit.story_exports.month', 'base', 300, 'studio plan fixture'),
      ('studio-v1', 'limit.ai.credits.month', 'base', 500, 'studio plan fixture');

    CREATE FUNCTION protect_access_catalog_key() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'access catalog keys are stable; archive and add a new key instead';
      ELSIF NEW.code <> OLD.code THEN
        RAISE EXCEPTION 'access catalog keys are stable; archive and add a new key instead';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER access_capabilities_stable BEFORE UPDATE OR DELETE ON access_capabilities
      FOR EACH ROW EXECUTE FUNCTION protect_access_catalog_key();
    CREATE TRIGGER access_limit_definitions_stable BEFORE UPDATE OR DELETE ON access_limit_definitions
      FOR EACH ROW EXECUTE FUNCTION protect_access_catalog_key();

    CREATE FUNCTION protect_locked_plan_version() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'DELETE' OR OLD.locked_at IS NOT NULL THEN
        RAISE EXCEPTION 'locked access plan versions are immutable';
      END IF;
      IF NEW.code <> OLD.code OR NEW.plan_key <> OLD.plan_key OR NEW.version <> OLD.version THEN
        RAISE EXCEPTION 'access plan identity is immutable';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER access_plan_versions_immutable BEFORE UPDATE OR DELETE ON access_plan_versions
      FOR EACH ROW EXECUTE FUNCTION protect_locked_plan_version();

    CREATE FUNCTION protect_locked_plan_content() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      plan_code text;
      plan_locked_at timestamptz;
    BEGIN
      plan_code := CASE
        WHEN TG_OP = 'DELETE' THEN OLD.plan_version_code
        WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.plan_version_code, NEW.plan_version_code)
        ELSE NEW.plan_version_code
      END;
      IF plan_code IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
      SELECT locked_at INTO plan_locked_at FROM access_plan_versions WHERE code = plan_code;
      IF plan_locked_at IS NOT NULL THEN RAISE EXCEPTION 'locked access plan contents are immutable'; END IF;
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END $$;
    CREATE TRIGGER access_plan_roles_immutable BEFORE INSERT OR UPDATE OR DELETE ON access_role_assignments
      FOR EACH ROW EXECUTE FUNCTION protect_locked_plan_content();
    CREATE TRIGGER access_plan_capabilities_immutable BEFORE INSERT OR UPDATE OR DELETE ON access_capability_assignments
      FOR EACH ROW EXECUTE FUNCTION protect_locked_plan_content();
    CREATE TRIGGER access_plan_limits_immutable BEFORE INSERT OR UPDATE OR DELETE ON access_limit_assignments
      FOR EACH ROW EXECUTE FUNCTION protect_locked_plan_content();

    CREATE FUNCTION record_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      payload jsonb;
      actor_value text;
      reason_value text;
      entity_value text;
    BEGIN
      payload := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
      actor_value := COALESCE(payload->>'created_by', payload->>'updated_by');
      reason_value := COALESCE(NULLIF(payload->>'reason', ''), 'system access change');
      entity_value := COALESCE(payload->>'id', payload->>'capability_code', payload->>'profile_id', payload->>'cohort_code', 'unknown');
      INSERT INTO access_audit_log (actor_profile_id, action, entity_type, entity_key, reason, old_data, new_data)
      VALUES (
        CASE WHEN actor_value IS NULL OR actor_value = '' THEN NULL ELSE actor_value::uuid END,
        lower(TG_OP), TG_TABLE_NAME, entity_value, reason_value,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
      );
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END $$;
    CREATE TRIGGER access_cohort_memberships_audit AFTER INSERT OR UPDATE OR DELETE ON access_cohort_memberships
      FOR EACH ROW EXECUTE FUNCTION record_access_audit();
    CREATE TRIGGER access_role_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON access_role_assignments
      FOR EACH ROW EXECUTE FUNCTION record_access_audit();
    CREATE TRIGGER access_capability_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON access_capability_assignments
      FOR EACH ROW EXECUTE FUNCTION record_access_audit();
    CREATE TRIGGER access_limit_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON access_limit_assignments
      FOR EACH ROW EXECUTE FUNCTION record_access_audit();
    CREATE TRIGGER access_operational_switches_audit AFTER INSERT OR UPDATE OR DELETE ON access_operational_switches
      FOR EACH ROW EXECUTE FUNCTION record_access_audit();
  `,
}, {
  version: 7,
  sql: `
    INSERT INTO access_role_assignments (profile_id, role_code, reason)
    SELECT profile.id, 'access_manager', 'bootstrap initial access manager requested by product owner'
    FROM profiles profile
    WHERE lower(btrim(profile.email)) = 'chernov.sergey@gmail.com'
      AND NOT EXISTS (
        SELECT 1
        FROM access_role_assignments assignment
        WHERE assignment.profile_id = profile.id
          AND assignment.role_code = 'access_manager'
          AND (assignment.starts_at IS NULL OR assignment.starts_at <= now())
          AND (assignment.expires_at IS NULL OR assignment.expires_at > now())
      );
  `,
}, {
  version: 8,
  sql: `
    ALTER TABLE scene_renders
      ADD COLUMN progress_percent smallint NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
      ADD COLUMN progress_phase varchar(20) NOT NULL DEFAULT 'queued'
        CHECK (progress_phase IN ('queued', 'downloading', 'rendering', 'finalizing', 'uploading', 'ready'));
    UPDATE scene_renders SET
      progress_percent = CASE WHEN status = 'ready' THEN 100 WHEN status = 'running' THEN 1 ELSE 0 END,
      progress_phase = CASE WHEN status = 'ready' THEN 'ready' WHEN status = 'running' THEN 'downloading' ELSE 'queued' END;
  `,
}, {
  version: 9,
  sql: `
    ALTER TABLE scene_renders ADD COLUMN render_slot text GENERATED ALWAYS AS (
      CASE
        WHEN input->>'artifact' = 'scene-frame' THEN 'scene-frame'
        WHEN input->>'rendererId' = 'video' THEN 'scene-render:' || COALESCE(input->>'mode', 'video')
        ELSE 'scene-render:video'
      END
    ) STORED;
    CREATE INDEX scene_renders_slot_idx ON scene_renders(story_id, scene_id, render_slot);

    WITH ranked AS (
      SELECT id, storage_key, row_number() OVER (
        PARTITION BY story_id, scene_id, render_slot ORDER BY created_at DESC, id DESC
      ) AS position
      FROM scene_renders
    )
    INSERT INTO object_deletion_jobs (storage_key)
    SELECT DISTINCT storage_key FROM ranked WHERE position > 1 AND storage_key IS NOT NULL
    ON CONFLICT (storage_key) DO UPDATE SET status = 'queued', attempts = 0, worker_id = NULL,
      locked_until = NULL, error = NULL, updated_at = now();

    WITH ranked AS (
      SELECT id, row_number() OVER (
        PARTITION BY story_id, scene_id, render_slot ORDER BY created_at DESC, id DESC
      ) AS position
      FROM scene_renders
    )
    DELETE FROM scene_renders render USING ranked
    WHERE render.id = ranked.id AND ranked.position > 1;
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
    try { await client.query("SELECT pg_advisory_unlock(813791234)"); }
    finally { client.release(); }
  }
}
