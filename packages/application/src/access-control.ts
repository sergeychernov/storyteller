export const capabilityCodes = [
  "admin.console.access",
  "admin.users.list",
  "admin.users.read",
  "admin.users.activity.read",
  "admin.sessions.metadata.read",
  "admin.audit.read",
  "admin.access.explain",
  "admin.permissions.read",
  "admin.roles.read",
  "admin.cohorts.read",
  "admin.access.assign_role",
  "admin.access.assign_cohort",
  "admin.access.override",
  "admin.sessions.revoke",
  "studio.access",
  "story.list",
  "story.create",
  "story.read",
  "story.update",
  "story.delete",
  "media.upload",
  "scene.render",
  "story.export",
  "profile.platform_credentials.manage",
  "publish.youtube",
  "studio.timeline.access",
  "studio.collage.access",
  "studio.custom_layout.access",
  "studio.scene_groups.access",
  "mobile.access",
  "mcp.access",
  "ai.story_assist.use",
  "ai.music.generate",
  "ai.cover.generate",
  "developer.diagnostics.read",
] as const;

export type CapabilityCode = typeof capabilityCodes[number];

export const limitCodes = [
  "limit.stories.active",
  "limit.storage.bytes",
  "limit.scene_renders.month",
  "limit.story_exports.month",
  "limit.ai.credits.month",
] as const;

export type LimitCode = typeof limitCodes[number];
export const roleCodes = ["creator", "access_manager"] as const;
export type AccessRoleCode = typeof roleCodes[number];

export const roleCapabilities = {
  creator: [
    "studio.access",
    "story.list",
    "story.create",
    "story.read",
    "story.update",
    "story.delete",
    "media.upload",
    "scene.render",
    "story.export",
    "profile.platform_credentials.manage",
    "publish.youtube",
  ],
  access_manager: capabilityCodes.filter((code) => code.startsWith("admin.")),
} satisfies Readonly<Record<AccessRoleCode, readonly CapabilityCode[]>>;

export type AccessSubject =
  | { readonly kind: "plan_version"; readonly key: string }
  | { readonly kind: "cohort"; readonly key: string }
  | { readonly kind: "profile"; readonly key: string };

interface TimedAccessRecord {
  readonly startsAt?: string;
  readonly expiresAt?: string;
  readonly reason: string;
}

export interface CohortMembership extends TimedAccessRecord {
  readonly cohortCode: string;
}

export interface AccessRoleAssignment extends TimedAccessRecord {
  readonly subject: AccessSubject;
  readonly roleCode: AccessRoleCode;
}

export interface CapabilityAssignment extends TimedAccessRecord {
  readonly subject: AccessSubject;
  readonly capabilityCode: CapabilityCode;
  readonly effect: "allow" | "deny";
}

export interface LimitAssignment extends TimedAccessRecord {
  readonly subject: AccessSubject;
  readonly limitCode: LimitCode;
  readonly operation: "base" | "add" | "replace";
  readonly value: number | "unlimited";
}

export interface OperationalSwitch {
  readonly capabilityCode: CapabilityCode;
  readonly disabled: boolean;
  readonly reason: string;
}

export interface AccessState {
  readonly profileId: string;
  readonly planVersionCode?: string;
  readonly memberships: readonly CohortMembership[];
  readonly roleAssignments: readonly AccessRoleAssignment[];
  readonly capabilityAssignments: readonly CapabilityAssignment[];
  readonly limitAssignments: readonly LimitAssignment[];
  readonly operationalSwitches: readonly OperationalSwitch[];
}

export interface AccessExplanationSource {
  readonly kind: "plan_version" | "role" | "cohort" | "user_override" | "operational_switch";
  readonly key: string;
  readonly effect: "allow" | "deny" | "base" | "add" | "replace";
  readonly via?: string;
  readonly decisive: boolean;
}

export interface EffectiveCapability {
  readonly code: CapabilityCode;
  readonly allowed: boolean;
  readonly expiresAt?: string;
  readonly sources: readonly AccessExplanationSource[];
}

export interface EffectiveLimit {
  readonly code: LimitCode;
  readonly value: number | "unlimited" | null;
  readonly expiresAt?: string;
  readonly sources: readonly AccessExplanationSource[];
}

export interface EffectiveAccess {
  readonly planVersionCode: string | null;
  readonly roles: readonly AccessRoleCode[];
  readonly capabilities: readonly EffectiveCapability[];
  readonly limits: readonly EffectiveLimit[];
  readonly evaluatedAt: string;
}

export interface AccessStateRepository {
  loadAccessState(profileId: string): Promise<AccessState>;
}

export class AccessControlService {
  constructor(
    private readonly repository: AccessStateRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async resolve(profileId: string): Promise<EffectiveAccess> {
    return resolveEffectiveAccess(await this.repository.loadAccessState(profileId), this.clock());
  }

  async capability(profileId: string, capabilityCode: CapabilityCode): Promise<EffectiveCapability> {
    const access = await this.resolve(profileId);
    return access.capabilities.find(({ code }) => code === capabilityCode) ?? denyByDefault(capabilityCode);
  }
}

export function createBaselineAccessControl(): AccessControlService {
  return new AccessControlService({
    loadAccessState: async (profileId) => createBaselineAccessState(profileId),
  });
}

export function createBaselineAccessState(profileId: string): AccessState {
  return {
    profileId,
    planVersionCode: "free-v1",
    memberships: [],
    roleAssignments: [{
      subject: { kind: "plan_version", key: "free-v1" },
      roleCode: "creator",
      reason: "baseline plan",
    }],
    capabilityAssignments: [],
    limitAssignments: [
      baselineLimit("limit.stories.active", 3),
      baselineLimit("limit.storage.bytes", 2 * 1024 * 1024 * 1024),
      baselineLimit("limit.scene_renders.month", 20),
      baselineLimit("limit.story_exports.month", 3),
      baselineLimit("limit.ai.credits.month", 0),
    ],
    operationalSwitches: [],
  };
}

export function resolveEffectiveAccess(state: AccessState, now = new Date()): EffectiveAccess {
  const capabilityContributions = new Map<CapabilityCode, CapabilityContribution[]>();
  const effectiveRoles = new Set<AccessRoleCode>();

  for (const assignment of state.roleAssignments) {
    const window = activeSubjectWindow(state, assignment.subject, assignment, now);
    if (!window || !isRoleCode(assignment.roleCode)) continue;
    effectiveRoles.add(assignment.roleCode);
    for (const capabilityCode of roleCapabilities[assignment.roleCode]) {
      addContribution(capabilityContributions, capabilityCode, {
        effect: "allow",
        specificity: subjectSpecificity(assignment.subject),
        ...(window.expiresAt ? { expiresAt: window.expiresAt } : {}),
        source: roleSource(assignment.subject, assignment.roleCode),
      });
    }
  }

  for (const assignment of state.capabilityAssignments) {
    const window = activeSubjectWindow(state, assignment.subject, assignment, now);
    if (!window || !isCapabilityCode(assignment.capabilityCode)) continue;
    addContribution(capabilityContributions, assignment.capabilityCode, {
      effect: assignment.effect,
      specificity: subjectSpecificity(assignment.subject),
      ...(window.expiresAt ? { expiresAt: window.expiresAt } : {}),
      source: subjectSource(assignment.subject, assignment.effect),
    });
  }

  for (const operationalSwitch of state.operationalSwitches) {
    if (!operationalSwitch.disabled || !isCapabilityCode(operationalSwitch.capabilityCode)) continue;
    addContribution(capabilityContributions, operationalSwitch.capabilityCode, {
      effect: "deny",
      specificity: 3,
      source: {
        kind: "operational_switch",
        key: operationalSwitch.capabilityCode,
        effect: "deny",
        decisive: false,
      },
    });
  }

  const capabilities = capabilityCodes.map((code) => resolveCapability(code, capabilityContributions.get(code) ?? []));
  const limits = limitCodes.map((code) => resolveLimit(code, state, now));
  return {
    planVersionCode: state.planVersionCode ?? null,
    roles: roleCodes.filter((roleCode) => effectiveRoles.has(roleCode)),
    capabilities,
    limits,
    evaluatedAt: now.toISOString(),
  };
}

export function isCapabilityCode(value: string): value is CapabilityCode {
  return (capabilityCodes as readonly string[]).includes(value);
}

export function isLimitCode(value: string): value is LimitCode {
  return (limitCodes as readonly string[]).includes(value);
}

export function isRoleCode(value: string): value is AccessRoleCode {
  return (roleCodes as readonly string[]).includes(value);
}

interface ActiveWindow { readonly expiresAt?: string }
interface CapabilityContribution {
  readonly effect: "allow" | "deny";
  readonly specificity: number;
  readonly expiresAt?: string;
  readonly source: AccessExplanationSource;
}

function resolveCapability(code: CapabilityCode, contributions: readonly CapabilityContribution[]): EffectiveCapability {
  if (!contributions.length) return denyByDefault(code);
  const highestSpecificity = Math.max(...contributions.map(({ specificity }) => specificity));
  const decisive = contributions.filter(({ specificity }) => specificity === highestSpecificity);
  const allowed = !decisive.some(({ effect }) => effect === "deny") && decisive.some(({ effect }) => effect === "allow");
  const sources = [...contributions]
    .sort(compareCapabilityContributions)
    .map(({ source, specificity }) => ({ ...source, decisive: specificity === highestSpecificity }));
  const expiresAt = nearestExpiry(decisive.map(({ expiresAt: value }) => value));
  return { code, allowed, ...(expiresAt ? { expiresAt } : {}), sources };
}

function denyByDefault(code: CapabilityCode): EffectiveCapability {
  return { code, allowed: false, sources: [] };
}

function resolveLimit(code: LimitCode, state: AccessState, now: Date): EffectiveLimit {
  const contributions = state.limitAssignments.flatMap((assignment): LimitContribution[] => {
    if (assignment.limitCode !== code) return [];
    const window = activeSubjectWindow(state, assignment.subject, assignment, now);
    if (!window) return [];
    return [{
      assignment,
      specificity: subjectSpecificity(assignment.subject),
      ...(window.expiresAt ? { expiresAt: window.expiresAt } : {}),
      source: subjectSource(assignment.subject, assignment.operation),
    }];
  }).sort(compareLimitContributions);
  if (!contributions.length) return { code, value: null, sources: [] };

  const bases = contributions.filter(({ assignment }) => assignment.operation === "base");
  const additions = contributions.filter(({ assignment }) => assignment.operation === "add");
  const replacements = contributions.filter(({ assignment }) => assignment.operation === "replace");
  const replacementSpecificity = replacements.length ? Math.max(...replacements.map(({ specificity }) => specificity)) : undefined;
  const replacement = replacementSpecificity === undefined ? undefined
    : replacements.filter(({ specificity }) => specificity === replacementSpecificity).at(-1);
  const base = bases.at(-1);
  const decisive = replacement ? [replacement] : [...(base ? [base] : []), ...additions];
  const value = replacement ? replacement.assignment.value : addLimitValues(base?.assignment.value ?? null, additions.map(({ assignment }) => assignment.value));
  const decisiveSet = new Set(decisive);
  const sources = contributions.map(({ source }, index) => ({ ...source, decisive: decisiveSet.has(contributions[index]!) }));
  const expiresAt = nearestExpiry(decisive.map(({ expiresAt: valueAt }) => valueAt));
  return { code, value, ...(expiresAt ? { expiresAt } : {}), sources };
}

interface LimitContribution {
  readonly assignment: LimitAssignment;
  readonly specificity: number;
  readonly expiresAt?: string;
  readonly source: AccessExplanationSource;
}

function addLimitValues(base: number | "unlimited" | null, additions: readonly (number | "unlimited")[]): number | "unlimited" | null {
  if (base === "unlimited" || additions.includes("unlimited")) return "unlimited";
  if (base === null && !additions.length) return null;
  return (base ?? 0) + additions.reduce<number>((sum, value) => sum + (typeof value === "number" ? value : 0), 0);
}

function activeSubjectWindow(
  state: AccessState,
  subject: AccessSubject,
  record: Pick<TimedAccessRecord, "startsAt" | "expiresAt">,
  now: Date,
): ActiveWindow | undefined {
  if (subject.kind === "plan_version" && subject.key !== state.planVersionCode) return undefined;
  if (subject.kind === "profile" && subject.key !== state.profileId) return undefined;
  if (subject.kind !== "cohort") return activeWindow([record], now);
  const membership = state.memberships.find(({ cohortCode }) => cohortCode === subject.key);
  return membership ? activeWindow([record, membership], now) : undefined;
}

function activeWindow(records: readonly Pick<TimedAccessRecord, "startsAt" | "expiresAt">[], now: Date): ActiveWindow | undefined {
  const starts = records.flatMap(({ startsAt }) => startsAt ? [Date.parse(startsAt)] : []);
  const expires = records.flatMap(({ expiresAt }) => expiresAt ? [Date.parse(expiresAt)] : []);
  if (starts.some((value) => !Number.isFinite(value) || value > now.getTime())) return undefined;
  if (expires.some((value) => !Number.isFinite(value) || value <= now.getTime())) return undefined;
  const expiresAt = expires.length ? new Date(Math.min(...expires)).toISOString() : undefined;
  return expiresAt ? { expiresAt } : {};
}

function subjectSpecificity(subject: AccessSubject): number {
  return subject.kind === "profile" ? 2 : subject.kind === "cohort" ? 1 : 0;
}

function roleSource(subject: AccessSubject, roleCode: AccessRoleCode): AccessExplanationSource {
  return {
    kind: "role",
    key: roleCode,
    effect: "allow",
    via: subject.kind === "profile" ? "user" : `${subject.kind}:${subject.key}`,
    decisive: false,
  };
}

function subjectSource(subject: AccessSubject, effect: AccessExplanationSource["effect"]): AccessExplanationSource {
  return {
    kind: subject.kind === "profile" ? "user_override" : subject.kind,
    key: subject.kind === "profile" ? "self" : subject.key,
    effect,
    decisive: false,
  };
}

function addContribution(
  target: Map<CapabilityCode, CapabilityContribution[]>,
  code: CapabilityCode,
  contribution: CapabilityContribution,
): void {
  const values = target.get(code) ?? [];
  values.push(contribution);
  target.set(code, values);
}

function baselineLimit(limitCode: LimitCode, value: number): LimitAssignment {
  return {
    subject: { kind: "plan_version", key: "free-v1" },
    limitCode,
    operation: "base",
    value,
    reason: "baseline plan",
  };
}

function nearestExpiry(values: readonly (string | undefined)[]): string | undefined {
  const timestamps = values.flatMap((value) => value ? [Date.parse(value)] : []).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : undefined;
}

function compareCapabilityContributions(left: CapabilityContribution, right: CapabilityContribution): number {
  return left.specificity - right.specificity
    || left.source.kind.localeCompare(right.source.kind)
    || left.source.key.localeCompare(right.source.key)
    || left.effect.localeCompare(right.effect);
}

function compareLimitContributions(left: LimitContribution, right: LimitContribution): number {
  return left.specificity - right.specificity
    || left.assignment.operation.localeCompare(right.assignment.operation)
    || left.source.key.localeCompare(right.source.key)
    || limitValueOrder(left.assignment.value) - limitValueOrder(right.assignment.value)
    || (left.expiresAt ?? "").localeCompare(right.expiresAt ?? "");
}

function limitValueOrder(value: number | "unlimited"): number {
  return value === "unlimited" ? Number.MAX_SAFE_INTEGER : value;
}
