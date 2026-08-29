import {
  isCapabilityCode,
  isLimitCode,
  isRoleCode,
  type AccessRoleAssignment,
  type AccessState,
  type AccessStateRepository,
  type AccessSubject,
  type CapabilityAssignment,
  type CohortMembership,
  type LimitAssignment,
  type OperationalSwitch,
} from "@storyteller/application";
import type { Pool } from "pg";

export class PostgresAccessRepository implements AccessStateRepository {
  constructor(private readonly pool: Pool) {}

  async loadAccessState(profileId: string): Promise<AccessState> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const profile = (await client.query<{ access_plan_version_code: string }>(
        "SELECT access_plan_version_code FROM profiles WHERE id = $1",
        [profileId],
      )).rows[0];
      if (!profile) {
        await client.query("COMMIT");
        return emptyAccessState(profileId);
      }

      const planVersionCode = profile.access_plan_version_code;
      const membershipsResult = await client.query<MembershipRow>(
        `SELECT cohort_code, starts_at, expires_at, reason
         FROM access_cohort_memberships WHERE profile_id = $1 ORDER BY cohort_code`,
        [profileId],
      );
      const rolesResult = await client.query<RoleAssignmentRow>(
        `${assignmentSelect("role_code")} FROM access_role_assignments
         WHERE plan_version_code = $2 OR profile_id = $1 OR cohort_code IN (
           SELECT cohort_code FROM access_cohort_memberships WHERE profile_id = $1
         ) ORDER BY id`,
        [profileId, planVersionCode],
      );
      const capabilitiesResult = await client.query<CapabilityAssignmentRow>(
        `${assignmentSelect("capability_code, effect")} FROM access_capability_assignments
         WHERE plan_version_code = $2 OR profile_id = $1 OR cohort_code IN (
           SELECT cohort_code FROM access_cohort_memberships WHERE profile_id = $1
         ) ORDER BY id`,
        [profileId, planVersionCode],
      );
      const limitsResult = await client.query<LimitAssignmentRow>(
        `${assignmentSelect("limit_code, operation, value, unlimited")} FROM access_limit_assignments
         WHERE plan_version_code = $2 OR profile_id = $1 OR cohort_code IN (
           SELECT cohort_code FROM access_cohort_memberships WHERE profile_id = $1
         ) ORDER BY id`,
        [profileId, planVersionCode],
      );
      const switchesResult = await client.query<OperationalSwitchRow>(
        "SELECT capability_code, disabled, reason FROM access_operational_switches ORDER BY capability_code",
      );
      await client.query("COMMIT");
      return {
        profileId,
        planVersionCode,
        memberships: membershipsResult.rows.map(mapMembership),
        roleAssignments: rolesResult.rows.flatMap(mapRoleAssignment),
        capabilityAssignments: capabilitiesResult.rows.flatMap(mapCapabilityAssignment),
        limitAssignments: limitsResult.rows.flatMap(mapLimitAssignment),
        operationalSwitches: switchesResult.rows.flatMap(mapOperationalSwitch),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function assignmentSelect(columns: string): string {
  return `SELECT plan_version_code, cohort_code, profile_id, starts_at, expires_at, reason, ${columns}`;
}

function emptyAccessState(profileId: string): AccessState {
  return {
    profileId,
    memberships: [],
    roleAssignments: [],
    capabilityAssignments: [],
    limitAssignments: [],
    operationalSwitches: [],
  };
}

interface AssignmentRow {
  readonly plan_version_code: string | null;
  readonly cohort_code: string | null;
  readonly profile_id: string | null;
  readonly starts_at: Date | string | null;
  readonly expires_at: Date | string | null;
  readonly reason: string;
}
interface MembershipRow {
  readonly cohort_code: string;
  readonly starts_at: Date | string | null;
  readonly expires_at: Date | string | null;
  readonly reason: string;
}
interface RoleAssignmentRow extends AssignmentRow { readonly role_code: string }
interface CapabilityAssignmentRow extends AssignmentRow {
  readonly capability_code: string;
  readonly effect: "allow" | "deny";
}
interface LimitAssignmentRow extends AssignmentRow {
  readonly limit_code: string;
  readonly operation: "base" | "add" | "replace";
  readonly value: string | number | null;
  readonly unlimited: boolean;
}
interface OperationalSwitchRow {
  readonly capability_code: string;
  readonly disabled: boolean;
  readonly reason: string;
}

function mapMembership(row: MembershipRow): CohortMembership {
  return {
    cohortCode: row.cohort_code,
    reason: row.reason,
    ...mapWindow(row),
  };
}

function mapRoleAssignment(row: RoleAssignmentRow): AccessRoleAssignment[] {
  if (!isRoleCode(row.role_code)) return [];
  return [{ subject: mapSubject(row), roleCode: row.role_code, reason: row.reason, ...mapWindow(row) }];
}

function mapCapabilityAssignment(row: CapabilityAssignmentRow): CapabilityAssignment[] {
  if (!isCapabilityCode(row.capability_code)) return [];
  return [{
    subject: mapSubject(row),
    capabilityCode: row.capability_code,
    effect: row.effect,
    reason: row.reason,
    ...mapWindow(row),
  }];
}

function mapLimitAssignment(row: LimitAssignmentRow): LimitAssignment[] {
  if (!isLimitCode(row.limit_code)) return [];
  const value = row.unlimited ? "unlimited" as const : Number(row.value);
  if (value !== "unlimited" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`invalid stored access limit: ${row.limit_code}`);
  }
  return [{
    subject: mapSubject(row),
    limitCode: row.limit_code,
    operation: row.operation,
    value,
    reason: row.reason,
    ...mapWindow(row),
  }];
}

function mapOperationalSwitch(row: OperationalSwitchRow): OperationalSwitch[] {
  return isCapabilityCode(row.capability_code) ? [{
    capabilityCode: row.capability_code,
    disabled: row.disabled,
    reason: row.reason,
  }] : [];
}

function mapSubject(row: AssignmentRow): AccessSubject {
  if (row.profile_id) return { kind: "profile", key: row.profile_id };
  if (row.cohort_code) return { kind: "cohort", key: row.cohort_code };
  if (row.plan_version_code) return { kind: "plan_version", key: row.plan_version_code };
  throw new Error("access assignment has no subject");
}

function mapWindow(row: { readonly starts_at: Date | string | null; readonly expires_at: Date | string | null }) {
  return {
    ...(row.starts_at ? { startsAt: toIso(row.starts_at) } : {}),
    ...(row.expires_at ? { expiresAt: toIso(row.expires_at) } : {}),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
