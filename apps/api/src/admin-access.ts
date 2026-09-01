import { createHash, randomUUID } from "node:crypto";
import {
  ApplicationError,
  isCapabilityCode,
  isLimitCode,
  isRoleCode,
  resolveEffectiveAccess,
  type AccessState,
  type CapabilityCode,
} from "@storyteller/application";
import {
  adminEffectiveAccessSchema,
  adminAccessOperationSchema,
  type AdminAccessApplyResult,
  type AdminAccessCatalogEntry,
  type AdminAccessManagement,
  type AdminAccessOperation,
  type AdminAccessPreview,
  type AdminAccessPreviewRequest,
  type AdminAccessRole,
} from "@storyteller/schemas";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { loadAccessState } from "./access-control-database.js";

const previewLifetimeMs = 10 * 60 * 1_000;
const accessMutationLock = 813791235;
const viableManagerCapabilities = [
  "admin.console.access",
  "admin.access.assign_role",
  "admin.access.assign_cohort",
  "admin.access.override",
  "admin.sessions.revoke",
] as const satisfies readonly CapabilityCode[];

export class AdminAccessService {
  constructor(private readonly pool: Pool, private readonly clock: () => Date = () => new Date()) {}

  async capabilities(): Promise<readonly AdminAccessCatalogEntry[]> {
    const result = await this.pool.query<{ code: string; archived_at: Date | string | null }>(
      "SELECT code, archived_at FROM access_capabilities ORDER BY code",
    );
    return result.rows.map(({ code, archived_at }) => ({ id: code, code, archived: archived_at !== null }));
  }

  async roles(): Promise<readonly AdminAccessRole[]> {
    const result = await this.pool.query<{ code: string; archived_at: Date | string | null; capabilities: string[] }>(`
      SELECT role.code, role.archived_at,
        COALESCE(array_agg(link.capability_code ORDER BY link.capability_code)
          FILTER (WHERE link.capability_code IS NOT NULL), '{}') AS capabilities
      FROM access_roles role
      LEFT JOIN access_role_capabilities link ON link.role_code = role.code
      GROUP BY role.code, role.archived_at ORDER BY role.code`);
    return result.rows.map(({ code, archived_at, capabilities }) => ({
      id: code, code, archived: archived_at !== null, capabilities,
    }));
  }

  async limits(): Promise<readonly AdminAccessCatalogEntry[]> {
    const result = await this.pool.query<{ code: string; archived_at: Date | string | null }>(
      "SELECT code, archived_at FROM access_limit_definitions ORDER BY code",
    );
    return result.rows.map(({ code, archived_at }) => ({ id: code, code, archived: archived_at !== null }));
  }

  async cohorts(): Promise<readonly AdminAccessCatalogEntry[]> {
    const result = await this.pool.query<{ code: string; archived_at: Date | string | null }>(
      "SELECT code, archived_at FROM access_cohorts ORDER BY code",
    );
    return result.rows.map(({ code, archived_at }) => ({ id: code, code, archived: archived_at !== null }));
  }

  async management(profileId: string): Promise<AdminAccessManagement> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const profile = (await client.query<{ access_revision: string }>(
        "SELECT access_revision FROM profiles WHERE id = $1", [profileId],
      )).rows[0];
      if (!profile) throw new ApplicationError("profile not found", 404, "profile_not_found");
      const [memberships, roles, capabilities, limits, state] = await Promise.all([
        client.query<MembershipRow>(`${windowSelect("cohort_code")} FROM access_cohort_memberships WHERE profile_id = $1 ORDER BY cohort_code`, [profileId]),
        client.query<RoleRow>(`${windowSelect("id::text, role_code")} FROM access_role_assignments WHERE profile_id = $1 ORDER BY role_code`, [profileId]),
        client.query<CapabilityRow>(`${windowSelect("id::text, capability_code, effect")} FROM access_capability_assignments WHERE profile_id = $1 ORDER BY capability_code`, [profileId]),
        client.query<LimitRow>(`${windowSelect("id::text, limit_code, operation, value, unlimited")} FROM access_limit_assignments WHERE profile_id = $1 ORDER BY limit_code`, [profileId]),
        loadAccessState(client, profileId),
      ]);
      await client.query("COMMIT");
      return {
        id: profileId,
        revision: Number(profile.access_revision),
        memberships: memberships.rows.map((row) => ({ cohortCode: row.cohort_code, ...mapWindow(row) })),
        roles: roles.rows.map((row) => ({ id: row.id, roleCode: row.role_code, ...mapWindow(row) })),
        capabilityOverrides: capabilities.rows.map((row) => ({
          id: row.id, capabilityCode: row.capability_code, effect: row.effect, ...mapWindow(row),
        })),
        limitOverrides: limits.rows.map((row) => ({
          id: row.id, limitCode: row.limit_code, operation: row.operation,
          value: row.unlimited ? "unlimited" : Number(row.value), ...mapWindow(row),
        })),
        effective: adminEffectiveAccessSchema.parse(resolveEffectiveAccess(state, this.clock())),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async preview(actorProfileId: string, input: AdminAccessPreviewRequest): Promise<AdminAccessPreview> {
    const now = this.clock();
    const operation = normalizeOperation(input.operation, now);
    const profileIds = [...input.profileIds].sort();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      await validateOperationCatalog(client, operation);
      const snapshot = await buildPreview(client, actorProfileId, profileIds, operation, input.reason, now);
      const id = randomUUID();
      const expiresAt = new Date(now.getTime() + previewLifetimeMs).toISOString();
      await client.query(
        `INSERT INTO admin_access_previews
          (id, actor_profile_id, target_profile_ids, operation, reason, target_revisions, global_revision, result_hash, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, actorProfileId, profileIds, operation, input.reason, snapshot.revisions, snapshot.globalRevision, snapshot.hash, now, expiresAt],
      );
      await client.query(
        `INSERT INTO admin_audit_log
          (actor_profile_id, action, target_type, target_profile_id, target_entity_id, reason, batch_id, change)
         VALUES ($1, 'access.preview', 'access', $2, $3, $4, $5, $6)`,
        [actorProfileId, profileIds.length === 1 ? profileIds[0] : null, id, input.reason, id, {
          before: null,
          after: { operation: operation.type, targetCount: profileIds.length, changedCount: snapshot.changedCount,
            noOpCount: snapshot.noOpCount, blockedCount: snapshot.blockedCount },
        }],
      );
      await client.query("COMMIT");
      return previewResponse(id, expiresAt, input.reason, operation, snapshot);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async apply(actorProfileId: string, previewId: string, confirmation?: string): Promise<AdminAccessApplyResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      await client.query("SELECT pg_advisory_xact_lock($1)", [accessMutationLock]);
      const preview = (await client.query<PreviewRow>(
        "SELECT * FROM admin_access_previews WHERE id = $1 FOR UPDATE", [previewId],
      )).rows[0];
      if (!preview || preview.actor_profile_id !== actorProfileId) {
        throw new ApplicationError("access preview not found", 404, "access_preview_not_found");
      }
      const now = this.clock();
      if (preview.consumed_at) throw new ApplicationError("access preview was already applied", 409, "access_preview_consumed");
      if (new Date(preview.expires_at).getTime() <= now.getTime()) {
        throw new ApplicationError("access preview expired", 409, "access_preview_expired");
      }
      const profileIds = [...preview.target_profile_ids].sort();
      if (profileIds.length > 1 && confirmation !== `APPLY ${profileIds.length}`) {
        throw new ApplicationError("bulk confirmation does not match", 422, "bulk_confirmation_required");
      }
      await client.query("SELECT id FROM profiles WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [profileIds]);
      const operation = adminAccessOperationSchema.parse(preview.operation);
      await validateOperationCatalog(client, operation);
      const snapshot = await buildPreview(client, actorProfileId, profileIds, operation, preview.reason, now);
      if (snapshot.globalRevision !== Number(preview.global_revision)
        || stableJson(snapshot.revisions) !== stableJson(preview.target_revisions)
        || snapshot.hash !== preview.result_hash) {
        throw new ApplicationError("access state changed; create a new preview", 409, "access_preview_stale");
      }
      if (snapshot.blockedCount > 0) throw new ApplicationError("access preview is blocked", 409, "access_preview_blocked");
      if (snapshot.changedCount === 0) throw new ApplicationError("access preview contains no changes", 409, "access_preview_no_changes");

      await client.query("SELECT set_config('storyteller.actor_profile_id', $1, true)", [actorProfileId]);
      await client.query("SELECT set_config('storyteller.access_reason', $1, true)", [preview.reason]);
      await client.query("SELECT set_config('storyteller.access_batch_id', $1, true)", [previewId]);
      for (const target of snapshot.targets) {
        if (target.changed) await persistOperation(client, target.profileId, operation, preview.reason, actorProfileId);
      }
      await client.query("UPDATE admin_access_previews SET consumed_at = $2 WHERE id = $1", [previewId, now]);
      await client.query("COMMIT");
      return { ...previewResponse(previewId, toIso(preview.expires_at), preview.reason, operation, snapshot), appliedAt: now.toISOString() };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (isSerializationFailure(error)) {
        throw new ApplicationError("access state changed; create a new preview", 409, "access_preview_stale");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSession(
    actorProfileId: string,
    actorSessionId: string,
    targetProfileId: string,
    sessionId: string,
    reason: string,
  ): Promise<{ readonly id: string; readonly revokedAt: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
      const session = (await client.query<{ id: string; profile_id: string; revoked_at: Date | string | null; expires_at: Date | string }>(
        "SELECT id, profile_id, revoked_at, expires_at FROM sessions WHERE id = $1 AND profile_id = $2 FOR UPDATE",
        [sessionId, targetProfileId],
      )).rows[0];
      if (!session) throw new ApplicationError("session not found", 404, "session_not_found");
      if (session.id === actorSessionId) throw new ApplicationError("the current admin session cannot revoke itself", 409, "self_session_revoke_prevented");
      const now = this.clock();
      if (session.revoked_at || new Date(session.expires_at).getTime() <= now.getTime()) {
        throw new ApplicationError("session is not active", 409, "session_not_active");
      }
      await client.query("UPDATE sessions SET revoked_at = $2 WHERE id = $1", [sessionId, now]);
      await client.query(
        `INSERT INTO admin_audit_log
          (actor_profile_id, action, target_type, target_profile_id, target_entity_id, reason, change)
         VALUES ($1, 'users.sessions.revoke', 'session', $2, $3, $4, $5)`,
        [actorProfileId, targetProfileId, sessionId, reason, { before: { status: "active" }, after: { status: "revoked" } }],
      );
      await client.query("COMMIT");
      return { id: sessionId, revokedAt: now.toISOString() };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

interface PreviewSnapshot {
  readonly targets: AdminAccessPreview["targets"];
  readonly revisions: Readonly<Record<string, number | null>>;
  readonly globalRevision: number;
  readonly hash: string;
  readonly changedCount: number;
  readonly noOpCount: number;
  readonly blockedCount: number;
}

async function buildPreview(
  client: PoolClient,
  actorProfileId: string,
  profileIds: readonly string[],
  operation: AdminAccessOperation,
  reason: string,
  now: Date,
): Promise<PreviewSnapshot> {
  const actorAccess = resolveEffectiveAccess(await loadAccessState(client, actorProfileId), now);
  if (!capabilityAllowed(actorAccess, requiredCapability(operation))) {
    throw new ApplicationError("access denied", 403, "access_denied");
  }
  const profiles = await client.query<{ id: string; access_revision: string }>(
    "SELECT id, access_revision FROM profiles WHERE id = ANY($1::uuid[]) ORDER BY id", [profileIds],
  );
  const revisions: Record<string, number | null> = Object.fromEntries(profileIds.map((id) => [id, null]));
  const candidates = new Map<string, AccessState>();
  const targets: Array<AdminAccessPreview["targets"][number]> = [];
  for (const profileId of profileIds) {
    const profile = profiles.rows.find(({ id }) => id === profileId);
    if (!profile) {
      targets.push({ profileId, changed: false, blockers: ["profile_not_found"], before: null, after: null });
      continue;
    }
    revisions[profileId] = Number(profile.access_revision);
    const state = await loadAccessState(client, profileId);
    const before = adminEffectiveAccessSchema.parse(resolveEffectiveAccess(state, now));
    const changed = applyOperation(state, operation, reason);
    const after = adminEffectiveAccessSchema.parse(resolveEffectiveAccess(changed.state, now));
    const blockers: string[] = [];
    if (profileId === actorProfileId && changed.changed) {
      const required = requiredCapability(operation);
      if (!capabilityAllowed(after, "admin.console.access") || !capabilityAllowed(after, required)) {
        blockers.push("self_lockout_prevented");
      }
    }
    candidates.set(profileId, changed.state);
    targets.push({ profileId, changed: changed.changed, blockers, before, after });
  }
  if (targets.some(({ changed }) => changed) && !await hasViableManager(client, candidates, now)) {
    for (const target of targets) if (target.changed) target.blockers.push("last_access_manager_prevented");
  }
  const globalRevision = await readGlobalRevision(client);
  const hash = resultHash(operation, targets);
  return {
    targets,
    revisions,
    globalRevision,
    hash,
    changedCount: targets.filter(({ changed }) => changed).length,
    noOpCount: targets.filter(({ changed, blockers }) => !changed && blockers.length === 0).length,
    blockedCount: targets.filter(({ blockers }) => blockers.length > 0).length,
  };
}

export function applyOperation(
  state: AccessState,
  operation: AdminAccessOperation,
  reason: string,
): { readonly state: AccessState; readonly changed: boolean } {
  const profileSubject = { kind: "profile" as const, key: state.profileId };
  if (operation.type === "set_cohort_membership") {
    const desired = { cohortCode: operation.cohortCode, ...operationWindow(operation), reason };
    const current = state.memberships.find(({ cohortCode }) => cohortCode === operation.cohortCode);
    if (current && accessRecordEqual(current, desired)) return { state, changed: false };
    return { state: { ...state, memberships: [...state.memberships.filter(({ cohortCode }) => cohortCode !== operation.cohortCode), desired] }, changed: true };
  }
  if (operation.type === "remove_cohort_membership") {
    const next = state.memberships.filter(({ cohortCode }) => cohortCode !== operation.cohortCode);
    return { state: next.length === state.memberships.length ? state : { ...state, memberships: next }, changed: next.length !== state.memberships.length };
  }
  if (operation.type === "set_role") {
    if (!isRoleCode(operation.roleCode)) throw new ApplicationError("unknown access role", 422, "unknown_access_role");
    const desired = { subject: profileSubject, roleCode: operation.roleCode, ...operationWindow(operation), reason };
    const current = state.roleAssignments.find((assignment) => assignment.subject.kind === "profile" && assignment.roleCode === operation.roleCode);
    if (current && accessRecordEqual(current, desired)) return { state, changed: false };
    return { state: { ...state, roleAssignments: [...state.roleAssignments.filter((assignment) => !(assignment.subject.kind === "profile" && assignment.roleCode === operation.roleCode)), desired] }, changed: true };
  }
  if (operation.type === "remove_role") {
    const next = state.roleAssignments.filter((assignment) => !(assignment.subject.kind === "profile" && assignment.roleCode === operation.roleCode));
    return { state: next.length === state.roleAssignments.length ? state : { ...state, roleAssignments: next }, changed: next.length !== state.roleAssignments.length };
  }
  if (operation.type === "set_capability_override") {
    if (!isCapabilityCode(operation.capabilityCode)) throw new ApplicationError("unknown capability", 422, "unknown_capability");
    const desired = { subject: profileSubject, capabilityCode: operation.capabilityCode, effect: operation.effect, ...operationWindow(operation), reason };
    const current = state.capabilityAssignments.find((assignment) => assignment.subject.kind === "profile" && assignment.capabilityCode === operation.capabilityCode);
    if (current && accessRecordEqual(current, desired)) return { state, changed: false };
    return { state: { ...state, capabilityAssignments: [...state.capabilityAssignments.filter((assignment) => !(assignment.subject.kind === "profile" && assignment.capabilityCode === operation.capabilityCode)), desired] }, changed: true };
  }
  if (operation.type === "remove_capability_override") {
    const next = state.capabilityAssignments.filter((assignment) => !(assignment.subject.kind === "profile" && assignment.capabilityCode === operation.capabilityCode));
    return { state: next.length === state.capabilityAssignments.length ? state : { ...state, capabilityAssignments: next }, changed: next.length !== state.capabilityAssignments.length };
  }
  if (operation.type === "set_limit_override") {
    if (!isLimitCode(operation.limitCode)) throw new ApplicationError("unknown access limit", 422, "unknown_access_limit");
    const desired = { subject: profileSubject, limitCode: operation.limitCode, operation: operation.operation, value: operation.value, ...operationWindow(operation), reason };
    const current = state.limitAssignments.find((assignment) => assignment.subject.kind === "profile" && assignment.limitCode === operation.limitCode);
    if (current && accessRecordEqual(current, desired)) return { state, changed: false };
    return { state: { ...state, limitAssignments: [...state.limitAssignments.filter((assignment) => !(assignment.subject.kind === "profile" && assignment.limitCode === operation.limitCode)), desired] }, changed: true };
  }
  const next = state.limitAssignments.filter((assignment) => !(assignment.subject.kind === "profile" && assignment.limitCode === operation.limitCode));
  return { state: next.length === state.limitAssignments.length ? state : { ...state, limitAssignments: next }, changed: next.length !== state.limitAssignments.length };
}

async function persistOperation(
  client: PoolClient,
  profileId: string,
  operation: AdminAccessOperation,
  reason: string,
  actorProfileId: string,
): Promise<void> {
  await client.query("SELECT set_config('storyteller.target_profile_id', $1, true)", [profileId]);
  if (operation.type === "set_cohort_membership") {
    await client.query(
      `INSERT INTO access_cohort_memberships (profile_id, cohort_code, starts_at, expires_at, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (profile_id, cohort_code) DO UPDATE SET starts_at = EXCLUDED.starts_at,
         expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason, created_by = EXCLUDED.created_by`,
      [profileId, operation.cohortCode, operation.startsAt, operation.expiresAt ?? null, reason, actorProfileId],
    );
  } else if (operation.type === "remove_cohort_membership") {
    await client.query("DELETE FROM access_cohort_memberships WHERE profile_id = $1 AND cohort_code = $2", [profileId, operation.cohortCode]);
  } else if (operation.type === "set_role") {
    await client.query(
      `INSERT INTO access_role_assignments (profile_id, role_code, starts_at, expires_at, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (profile_id, role_code) WHERE profile_id IS NOT NULL DO UPDATE SET starts_at = EXCLUDED.starts_at,
         expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason, created_by = EXCLUDED.created_by`,
      [profileId, operation.roleCode, operation.startsAt, operation.expiresAt ?? null, reason, actorProfileId],
    );
  } else if (operation.type === "remove_role") {
    await client.query("DELETE FROM access_role_assignments WHERE profile_id = $1 AND role_code = $2", [profileId, operation.roleCode]);
  } else if (operation.type === "set_capability_override") {
    await client.query(
      `INSERT INTO access_capability_assignments
        (profile_id, capability_code, effect, starts_at, expires_at, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (profile_id, capability_code) WHERE profile_id IS NOT NULL DO UPDATE SET effect = EXCLUDED.effect,
         starts_at = EXCLUDED.starts_at, expires_at = EXCLUDED.expires_at,
         reason = EXCLUDED.reason, created_by = EXCLUDED.created_by`,
      [profileId, operation.capabilityCode, operation.effect, operation.startsAt, operation.expiresAt ?? null, reason, actorProfileId],
    );
  } else if (operation.type === "remove_capability_override") {
    await client.query("DELETE FROM access_capability_assignments WHERE profile_id = $1 AND capability_code = $2", [profileId, operation.capabilityCode]);
  } else if (operation.type === "set_limit_override") {
    await client.query(
      `INSERT INTO access_limit_assignments
        (profile_id, limit_code, operation, value, unlimited, starts_at, expires_at, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (profile_id, limit_code) WHERE profile_id IS NOT NULL DO UPDATE SET operation = EXCLUDED.operation,
         value = EXCLUDED.value, unlimited = EXCLUDED.unlimited, starts_at = EXCLUDED.starts_at,
         expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason, created_by = EXCLUDED.created_by`,
      [profileId, operation.limitCode, operation.operation, operation.value === "unlimited" ? null : operation.value,
        operation.value === "unlimited", operation.startsAt, operation.expiresAt ?? null, reason, actorProfileId],
    );
  } else {
    await client.query("DELETE FROM access_limit_assignments WHERE profile_id = $1 AND limit_code = $2", [profileId, operation.limitCode]);
  }
}

async function validateOperationCatalog(client: PoolClient, operation: AdminAccessOperation): Promise<void> {
  if ((operation.type === "set_role" || operation.type === "remove_role") && !isRoleCode(operation.roleCode)) {
    throw new ApplicationError("unknown access role", 422, "unknown_access_role");
  }
  if ((operation.type === "set_capability_override" || operation.type === "remove_capability_override")
    && !isCapabilityCode(operation.capabilityCode)) {
    throw new ApplicationError("unknown capability", 422, "unknown_capability");
  }
  if ((operation.type === "set_limit_override" || operation.type === "remove_limit_override") && !isLimitCode(operation.limitCode)) {
    throw new ApplicationError("unknown access limit", 422, "unknown_access_limit");
  }
  const code = operation.type === "set_cohort_membership" || operation.type === "remove_cohort_membership"
    ? operation.cohortCode : undefined;
  if (code && !(await client.query(
    `SELECT 1 FROM access_cohorts WHERE code = $1${operation.type === "set_cohort_membership" ? " AND archived_at IS NULL" : ""}`,
    [code],
  )).rowCount) {
    throw new ApplicationError("unknown or archived cohort", 422, "unknown_access_cohort");
  }
  const catalog = operation.type === "set_role" ? ["access_roles", operation.roleCode]
    : operation.type === "set_capability_override" ? ["access_capabilities", operation.capabilityCode]
    : operation.type === "set_limit_override" ? ["access_limit_definitions", operation.limitCode]
    : undefined;
  if (catalog && !(await client.query(`SELECT 1 FROM ${catalog[0]} WHERE code = $1 AND archived_at IS NULL`, [catalog[1]])).rowCount) {
    throw new ApplicationError("access catalog entry is archived", 422, "access_catalog_entry_archived");
  }
  if (operation.type.startsWith("set_") && "startsAt" in operation) {
    const starts = Date.parse(operation.startsAt ?? "");
    const expires = operation.expiresAt ? Date.parse(operation.expiresAt) : undefined;
    if (!Number.isFinite(starts) || (expires !== undefined && (!Number.isFinite(expires) || expires <= starts))) {
      throw new ApplicationError("access expiry must be after its start", 422, "invalid_access_window");
    }
  }
}

function normalizeOperation(operation: AdminAccessOperation, now: Date): AdminAccessOperation {
  if (!operation.type.startsWith("set_") || !("startsAt" in operation)) return operation;
  return { ...operation, startsAt: operation.startsAt ?? now.toISOString() };
}

function operationWindow(operation: { readonly startsAt?: string | undefined; readonly expiresAt?: string | undefined }) {
  return {
    ...(operation.startsAt ? { startsAt: operation.startsAt } : {}),
    ...(operation.expiresAt ? { expiresAt: operation.expiresAt } : {}),
  };
}

async function hasViableManager(client: PoolClient, candidates: ReadonlyMap<string, AccessState>, now: Date): Promise<boolean> {
  const profiles = await client.query<{ id: string }>(`
    SELECT id FROM (
      SELECT assignment.profile_id AS id
      FROM access_role_assignments assignment
      WHERE assignment.role_code = 'access_manager' AND assignment.profile_id IS NOT NULL
        AND (assignment.starts_at IS NULL OR assignment.starts_at <= $1)
        AND (assignment.expires_at IS NULL OR assignment.expires_at > $1)
      UNION
      SELECT profile.id
      FROM access_role_assignments assignment
      JOIN profiles profile ON profile.access_plan_version_code = assignment.plan_version_code
      WHERE assignment.role_code = 'access_manager' AND assignment.plan_version_code IS NOT NULL
        AND (assignment.starts_at IS NULL OR assignment.starts_at <= $1)
        AND (assignment.expires_at IS NULL OR assignment.expires_at > $1)
      UNION
      SELECT membership.profile_id AS id
      FROM access_role_assignments assignment
      JOIN access_cohort_memberships membership ON membership.cohort_code = assignment.cohort_code
      WHERE assignment.role_code = 'access_manager' AND assignment.cohort_code IS NOT NULL
        AND (assignment.starts_at IS NULL OR assignment.starts_at <= $1)
        AND (assignment.expires_at IS NULL OR assignment.expires_at > $1)
        AND (membership.starts_at IS NULL OR membership.starts_at <= $1)
        AND (membership.expires_at IS NULL OR membership.expires_at > $1)
    ) manager_profiles
    ORDER BY id`, [now]);
  const profileIds = new Set([...profiles.rows.map(({ id }) => id), ...candidates.keys()]);
  for (const id of [...profileIds].sort()) {
    const state = candidates.get(id) ?? await loadAccessState(client, id);
    const access = resolveEffectiveAccess(state, now);
    if (access.roles.includes("access_manager") && viableManagerCapabilities.every((code) => capabilityAllowed(access, code))) return true;
  }
  return false;
}

function requiredCapability(operation: AdminAccessOperation): CapabilityCode {
  if (operation.type.endsWith("role")) return "admin.access.assign_role";
  if (operation.type.endsWith("cohort_membership")) return "admin.access.assign_cohort";
  return "admin.access.override";
}

function capabilityAllowed(
  access: { readonly capabilities: readonly { readonly code: string; readonly allowed: boolean }[] },
  code: CapabilityCode,
): boolean {
  return access.capabilities.find(({ code: candidate }) => candidate === code)?.allowed === true;
}

function resultHash(operation: AdminAccessOperation, targets: AdminAccessPreview["targets"]): string {
  const decisions = targets.map(({ profileId, changed, blockers, before, after }) => ({
    profileId, changed, blockers,
    before: accessDecisionDigest(before), after: accessDecisionDigest(after),
  }));
  return createHash("sha256").update(stableJson({ operation, decisions })).digest("hex");
}

function accessDecisionDigest(access: AdminAccessPreview["targets"][number]["before"]) {
  return access && {
    planVersionCode: access.planVersionCode,
    roles: access.roles,
    capabilities: access.capabilities,
    limits: access.limits,
  };
}

function previewResponse(
  id: string,
  expiresAt: string,
  reason: string,
  operation: AdminAccessOperation,
  snapshot: PreviewSnapshot,
): AdminAccessPreview {
  return {
    id, expiresAt, reason, operation, targets: snapshot.targets, targetCount: snapshot.targets.length,
    changedCount: snapshot.changedCount, noOpCount: snapshot.noOpCount, blockedCount: snapshot.blockedCount,
    applicable: snapshot.changedCount > 0 && snapshot.blockedCount === 0,
  };
}

async function readGlobalRevision(client: PoolClient): Promise<number> {
  return Number((await client.query<{ revision: string }>(
    "SELECT revision FROM access_global_revision WHERE singleton",
  )).rows[0]?.revision ?? 0);
}

function accessRecordEqual(left: object, right: object): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function windowSelect(columns: string): string {
  return `SELECT ${columns}, starts_at, expires_at, reason, created_by, created_at`;
}

interface WindowRow extends QueryResultRow {
  starts_at: Date | string | null;
  expires_at: Date | string | null;
  reason: string;
  created_by: string | null;
  created_at: Date | string;
}
interface MembershipRow extends WindowRow { cohort_code: string }
interface RoleRow extends WindowRow { id: string; role_code: string }
interface CapabilityRow extends WindowRow { id: string; capability_code: string; effect: "allow" | "deny" }
interface LimitRow extends WindowRow {
  id: string; limit_code: string; operation: "add" | "replace"; value: number | string | null; unlimited: boolean;
}
interface PreviewRow extends QueryResultRow {
  id: string;
  actor_profile_id: string;
  target_profile_ids: string[];
  operation: unknown;
  reason: string;
  target_revisions: Record<string, number | null>;
  global_revision: number | string;
  result_hash: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
}

function mapWindow(row: WindowRow) {
  return {
    startsAt: row.starts_at ? toIso(row.starts_at) : null,
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isSerializationFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "40001";
}
