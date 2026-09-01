import { ApplicationError } from "@storyteller/application";
import type {
  AdminActivityEvent, AdminAuditEntry, AdminOverview, AdminPage, AdminSessionMetadata, AdminUserDetail, AdminUserSummary,
} from "@storyteller/schemas";
import type { Pool, PoolClient, QueryResultRow } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;
type PageInput = { readonly page: number; readonly perPage: number };
type AuditTarget = { readonly action: string; readonly targetType: string; readonly targetProfileId?: string };

export class AdminReadModel {
  constructor(private readonly pool: Pool) {}

  async overview(): Promise<AdminOverview> {
    const [registrations, sessions, stories, activity, coverage] = await Promise.all([
      this.pool.query<{ today: string; last_7_days: string; last_30_days: string; total: string }>(`
        SELECT
          count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS today,
          count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS last_7_days,
          count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS last_30_days,
          count(*) AS total FROM profiles`),
      this.pool.query<{ active: string; observed: string }>(`
        SELECT count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now()) AS active,
          count(*) FILTER (WHERE created_at >= now() - interval '90 days') AS observed FROM sessions`),
      this.pool.query<{ status: "draft" | "rendering" | "ready" | "publishing" | "published"; count: string }>(
        "SELECT status, count(*) FROM stories GROUP BY status",
      ),
      this.pool.query<{ code: AdminActivityEvent["code"]; count: string }>(
        "SELECT code, count(*) FROM product_activity_events GROUP BY code ORDER BY code",
      ),
      this.pool.query<{ started_at: Date | string | null }>("SELECT min(occurred_at) AS started_at FROM product_activity_events"),
    ]);
    const registrationRow = registrations.rows[0]!;
    const sessionRow = sessions.rows[0]!;
    const storyCounts = { draft: 0, rendering: 0, ready: 0, publishing: 0, published: 0 };
    for (const row of stories.rows) storyCounts[row.status] = Number(row.count);
    return {
      registrations: {
        today: Number(registrationRow.today), last7Days: Number(registrationRow.last_7_days),
        last30Days: Number(registrationRow.last_30_days), total: Number(registrationRow.total),
      },
      sessions: { active: Number(sessionRow.active), observedLast90Days: Number(sessionRow.observed) },
      stories: storyCounts,
      activity: activity.rows.map(({ code, count }) => ({ code, count: Number(count) })),
      eventCoverageStartedAt: coverage.rows[0]?.started_at ? toIso(coverage.rows[0].started_at) : null,
      generatedAt: new Date().toISOString(),
    };
  }

  searchUsers(actorProfileId: string, input: PageInput & { readonly query?: string | undefined; readonly sort: string; readonly order: "ASC" | "DESC" }): Promise<AdminPage<AdminUserSummary>> {
    return this.audited(actorProfileId, { action: "users.search", targetType: "profile" }, async (client) => {
      const query = input.query?.trim().toLowerCase();
      const predicate = !query ? "TRUE" : isUuid(query) ? "p.id = $1::uuid" : "lower(p.email) LIKE $1 ESCAPE '!'";
      const parameters: unknown[] = !query ? [] : [isUuid(query) ? query : `${escapeLike(query)}%`];
      const total = await client.query<{ count: string }>(`SELECT count(*) FROM profiles p WHERE ${predicate}`, parameters);
      const orderColumn = ({ createdAt: "p.created_at", email: "lower(p.email)", lastSeenAt: "last_seen_at", storyCount: "story_count" } as const)[input.sort as "createdAt"] ?? "p.created_at";
      parameters.push(input.perPage, (input.page - 1) * input.perPage);
      const rows = await client.query<AdminUserRow>(`
        SELECT p.id, p.name, p.email, p.language, p.created_at,
          (SELECT max(s.last_seen_at) FROM sessions s WHERE s.profile_id = p.id) AS last_seen_at,
          (SELECT count(*) FROM stories story WHERE story.profile_id = p.id)::int AS story_count,
          (SELECT count(*) FROM sessions s WHERE s.profile_id = p.id AND s.revoked_at IS NULL AND s.expires_at > now())::int AS active_session_count
        FROM profiles p WHERE ${predicate}
        ORDER BY ${orderColumn} ${input.order}, p.id ${input.order}
        LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`, parameters);
      return page(rows.rows.map(mapUserSummary), Number(total.rows[0]?.count ?? 0), input);
    });
  }

  user(actorProfileId: string, profileId: string): Promise<AdminUserDetail> {
    return this.audited(actorProfileId, { action: "users.read", targetType: "profile", targetProfileId: profileId }, async (client) => {
      const result = await client.query<AdminUserRow & { updated_at: Date | string }>(`
        SELECT p.id, p.name, p.email, p.language, p.created_at, p.updated_at,
          (SELECT max(s.last_seen_at) FROM sessions s WHERE s.profile_id = p.id) AS last_seen_at,
          (SELECT count(*) FROM stories story WHERE story.profile_id = p.id)::int AS story_count,
          (SELECT count(*) FROM sessions s WHERE s.profile_id = p.id AND s.revoked_at IS NULL AND s.expires_at > now())::int AS active_session_count
        FROM profiles p WHERE p.id = $1`, [profileId]);
      const row = result.rows[0];
      if (!row) throw new ApplicationError("profile not found", 404, "profile_not_found");
      return { ...mapUserSummary(row), updatedAt: toIso(row.updated_at) };
    });
  }

  activity(actorProfileId: string, input: PageInput & { readonly code?: string | undefined; readonly from?: string | undefined; readonly to?: string | undefined }, profileId?: string): Promise<AdminPage<AdminActivityEvent>> {
    return this.audited(actorProfileId, {
      action: profileId ? "users.activity.read" : "activity.read", targetType: "activity", ...(profileId ? { targetProfileId: profileId } : {}),
    }, async (client) => {
      if (profileId) await requireProfile(client, profileId);
      const values: unknown[] = [];
      const filters = [
        profileId ? `profile_id = $${values.push(profileId)}` : undefined,
        input.code ? `code = $${values.push(input.code)}` : undefined,
        input.from ? `occurred_at >= $${values.push(input.from)}` : undefined,
        input.to ? `occurred_at < $${values.push(input.to)}` : undefined,
      ].filter(Boolean).join(" AND ") || "TRUE";
      const total = await client.query<{ count: string }>(`SELECT count(*) FROM product_activity_events WHERE ${filters}`, values);
      values.push(input.perPage, (input.page - 1) * input.perPage);
      const result = await client.query<{ id: string; profile_id: string; code: AdminActivityEvent["code"]; occurred_at: Date | string }>(`
        SELECT id::text, profile_id, code, occurred_at FROM product_activity_events WHERE ${filters}
        ORDER BY occurred_at DESC, id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
      return page(result.rows.map((row) => ({ id: row.id, profileId: row.profile_id, code: row.code, occurredAt: toIso(row.occurred_at) })), Number(total.rows[0]?.count ?? 0), input);
    });
  }

  sessions(actorProfileId: string, profileId: string, input: PageInput, currentSessionId?: string): Promise<AdminPage<AdminSessionMetadata>> {
    return this.audited(actorProfileId, { action: "users.sessions.read", targetType: "session", targetProfileId: profileId }, async (client) => {
      await requireProfile(client, profileId);
      const total = await client.query<{ count: string }>("SELECT count(*) FROM sessions WHERE profile_id = $1", [profileId]);
      const result = await client.query<{ id: string; created_at: Date | string; last_seen_at: Date | string; expires_at: Date | string; revoked_at: Date | string | null }>(`
        SELECT id, created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE profile_id = $1
        ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [profileId, input.perPage, (input.page - 1) * input.perPage]);
      return page(result.rows.map((row) => ({
        id: row.id, createdAt: toIso(row.created_at), lastSeenAt: toIso(row.last_seen_at), expiresAt: toIso(row.expires_at),
        revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
        status: row.revoked_at ? "revoked" : new Date(row.expires_at).getTime() <= Date.now() ? "expired" : "active",
        isCurrent: row.id === currentSessionId,
      })), Number(total.rows[0]?.count ?? 0), input);
    });
  }

  audit(actorProfileId: string, input: PageInput & { readonly action?: string | undefined }): Promise<AdminPage<AdminAuditEntry>> {
    return this.audited(actorProfileId, { action: "audit.read", targetType: "audit" }, async (client) => {
      const values: unknown[] = [];
      const filter = input.action ? `WHERE action = $${values.push(input.action)}` : "";
      const union = `
        SELECT 'admin:' || id::text AS id, actor_profile_id, action, target_type, target_profile_id,
          target_entity_id, reason, batch_id, change, created_at, 'admin_read' AS source FROM admin_audit_log
        UNION ALL
        SELECT 'access:' || id::text AS id, actor_profile_id, action, entity_type AS target_type, target_profile_id,
          entity_key AS target_entity_id, reason, batch_id,
          jsonb_build_object('before', old_data, 'after', new_data) AS change,
          created_at, 'access_change' AS source FROM access_audit_log`;
      const total = await client.query<{ count: string }>(`SELECT count(*) FROM (${union}) audit ${filter}`, values);
      values.push(input.perPage, (input.page - 1) * input.perPage);
      const result = await client.query<AdminAuditRow>(`SELECT * FROM (${union}) audit ${filter}
        ORDER BY created_at DESC, id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
      return page(result.rows.map((row) => ({
        id: row.id, actorProfileId: row.actor_profile_id, action: row.action, targetType: row.target_type,
        targetProfileId: row.target_profile_id, targetEntityId: row.target_entity_id, occurredAt: toIso(row.created_at),
        source: row.source, reason: row.reason, batchId: row.batch_id,
        change: row.change ? { before: row.change.before ?? null, after: row.change.after ?? null } : null,
      })), Number(total.rows[0]?.count ?? 0), input);
    });
  }

  recordAudit(actorProfileId: string, target: AuditTarget): Promise<void> {
    return this.pool.query(
      "INSERT INTO admin_audit_log (actor_profile_id, action, target_type, target_profile_id) VALUES ($1, $2, $3, $4)",
      [actorProfileId, target.action, target.targetType, target.targetProfileId ?? null],
    ).then(() => undefined);
  }

  private async audited<T>(actorProfileId: string, target: AuditTarget, read: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await read(client);
      await client.query(
        "INSERT INTO admin_audit_log (actor_profile_id, action, target_type, target_profile_id) VALUES ($1, $2, $3, $4)",
        [actorProfileId, target.action, target.targetType, target.targetProfileId ?? null],
      );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

interface AdminUserRow extends QueryResultRow {
  id: string; name: string; email: string; language: "en" | "ru" | "sr-Latn" | "es";
  created_at: Date | string; last_seen_at: Date | string | null; story_count: number; active_session_count: number;
}
interface AdminAuditRow extends QueryResultRow {
  id: string; actor_profile_id: string | null; action: string; target_type: string; target_profile_id: string | null;
  target_entity_id: string | null; reason: string | null; batch_id: string | null;
  change: { before?: unknown; after?: unknown } | null; created_at: Date | string; source: "admin_read" | "access_change";
}

function mapUserSummary(row: AdminUserRow): AdminUserSummary {
  return {
    id: row.id, name: row.name, email: row.email, language: row.language, createdAt: toIso(row.created_at),
    lastSeenAt: row.last_seen_at ? toIso(row.last_seen_at) : null, storyCount: Number(row.story_count), activeSessionCount: Number(row.active_session_count),
  };
}

function page<T>(data: T[], total: number, input: PageInput): AdminPage<T> {
  return { data, total, page: input.page, perPage: input.perPage };
}

async function requireProfile(client: Queryable, profileId: string): Promise<void> {
  if (!(await client.query("SELECT 1 FROM profiles WHERE id = $1", [profileId])).rowCount) {
    throw new ApplicationError("profile not found", 404, "profile_not_found");
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapeLike(value: string): string {
  return value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");
}
