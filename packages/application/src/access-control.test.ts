import assert from "node:assert/strict";
import test from "node:test";
import {
  createBaselineAccessState,
  resolveEffectiveAccess,
  type AccessState,
  type CapabilityAssignment,
  type CohortMembership,
  type LimitAssignment,
} from "./access-control.js";

const now = new Date("2026-08-29T12:00:00.000Z");
const profileId = "00000000-0000-4000-8000-000000000001";

test("baseline plan gives existing users creator access and typed limits", () => {
  const access = resolveEffectiveAccess(createBaselineAccessState(profileId), now);
  assert.deepEqual(access.roles, ["creator"]);
  assert.equal(capability(access, "studio.access").allowed, true);
  assert.equal(capability(access, "story.create").allowed, true);
  assert.equal(capability(access, "admin.console.access").allowed, false);
  assert.equal(limit(access, "limit.stories.active").value, 3);
  assert.equal(limit(access, "limit.ai.credits.month").value, 0);
});

test("user deny overrides a plan role and explanation retains both sources", () => {
  const state = withCapabilities(createBaselineAccessState(profileId), [{
    subject: { kind: "profile", key: profileId },
    capabilityCode: "publish.youtube",
    effect: "deny",
    reason: "manual safety hold",
  }]);
  const decision = capability(resolveEffectiveAccess(state, now), "publish.youtube");
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.sources.map(({ kind, key, effect, decisive }) => ({ kind, key, effect, decisive })), [
    { kind: "role", key: "creator", effect: "allow", decisive: false },
    { kind: "user_override", key: "self", effect: "deny", decisive: true },
  ]);
});

test("deny wins same-level cohort conflicts independently of row order", () => {
  const memberships: CohortMembership[] = [
    { cohortCode: "alpha", reason: "fixture" },
    { cohortCode: "beta", reason: "fixture" },
  ];
  const assignments: CapabilityAssignment[] = [
    cohortCapability("alpha", "allow"),
    cohortCapability("beta", "deny"),
  ];
  for (const values of [assignments, [...assignments].reverse()]) {
    const state = { ...createBaselineAccessState(profileId), memberships, capabilityAssignments: values };
    const decision = capability(resolveEffectiveAccess(state, now), "studio.timeline.access");
    assert.equal(decision.allowed, false);
    assert.equal(decision.sources.filter(({ decisive }) => decisive).length, 2);
  }
});

test("a profile allow is more specific than a cohort deny", () => {
  const state: AccessState = {
    ...createBaselineAccessState(profileId),
    memberships: [{ cohortCode: "early_users", reason: "fixture" }],
    capabilityAssignments: [
      cohortCapability("early_users", "deny"),
      {
        subject: { kind: "profile", key: profileId },
        capabilityCode: "studio.timeline.access",
        effect: "allow",
        reason: "manual exception",
      },
    ],
  };
  const decision = capability(resolveEffectiveAccess(state, now), "studio.timeline.access");
  assert.equal(decision.allowed, true);
  assert.equal(decision.sources.find(({ kind }) => kind === "user_override")?.decisive, true);
});

test("expiry is applied to memberships and user overrides", () => {
  const activeUntil = "2026-09-01T00:00:00.000Z";
  const state: AccessState = {
    ...createBaselineAccessState(profileId),
    memberships: [{ cohortCode: "early_users", reason: "campaign", expiresAt: activeUntil }],
    capabilityAssignments: [{
      ...cohortCapability("early_users", "allow"),
      expiresAt: "2026-10-01T00:00:00.000Z",
    }],
  };
  const active = capability(resolveEffectiveAccess(state, now), "studio.timeline.access");
  assert.equal(active.allowed, true);
  assert.equal(active.expiresAt, activeUntil);
  assert.equal(capability(resolveEffectiveAccess(state, new Date(activeUntil)), "studio.timeline.access").allowed, false);
});

test("operational switch denies an otherwise allowed capability", () => {
  const state: AccessState = {
    ...createBaselineAccessState(profileId),
    operationalSwitches: [{ capabilityCode: "story.create", disabled: true, reason: "incident" }],
  };
  const decision = capability(resolveEffectiveAccess(state, now), "story.create");
  assert.equal(decision.allowed, false);
  assert.equal(decision.sources.at(-1)?.kind, "operational_switch");
  assert.equal(decision.sources.at(-1)?.decisive, true);
});

test("limit bonuses add to the plan and a more specific replace wins deterministically", () => {
  const memberships: CohortMembership[] = [{ cohortCode: "ambassadors", reason: "fixture" }];
  const bonuses: LimitAssignment[] = [
    {
      subject: { kind: "cohort", key: "ambassadors" },
      limitCode: "limit.ai.credits.month",
      operation: "add",
      value: 100,
      reason: "cohort bonus",
    },
    {
      subject: { kind: "profile", key: profileId },
      limitCode: "limit.ai.credits.month",
      operation: "add",
      value: 50,
      reason: "user bonus",
    },
  ];
  const state = { ...createBaselineAccessState(profileId), memberships, limitAssignments: [
    ...createBaselineAccessState(profileId).limitAssignments,
    ...bonuses,
  ] };
  assert.equal(limit(resolveEffectiveAccess(state, now), "limit.ai.credits.month").value, 150);
  const replaced = resolveEffectiveAccess({ ...state, limitAssignments: [...state.limitAssignments, {
    subject: { kind: "profile", key: profileId },
    limitCode: "limit.ai.credits.month",
    operation: "replace",
    value: 7,
    reason: "support override",
  }] }, now);
  assert.equal(limit(replaced, "limit.ai.credits.month").value, 7);
});

test("AI authorization stays separate from exhausted usage and plan versions do not change implicitly", () => {
  const state: AccessState = {
    ...createBaselineAccessState(profileId),
    planVersionCode: "studio-v1",
    roleAssignments: [{
      subject: { kind: "plan_version", key: "studio-v1" },
      roleCode: "creator",
      reason: "studio fixture",
    }],
    capabilityAssignments: [{
      subject: { kind: "plan_version", key: "studio-v1" },
      capabilityCode: "ai.music.generate",
      effect: "allow",
      reason: "studio fixture",
    }],
    limitAssignments: [{
      subject: { kind: "plan_version", key: "studio-v1" },
      limitCode: "limit.ai.credits.month",
      operation: "base",
      value: 0,
      reason: "exhausted fixture",
    }],
  };
  const access = resolveEffectiveAccess(state, now);
  assert.equal(access.planVersionCode, "studio-v1");
  assert.equal(capability(access, "ai.music.generate").allowed, true);
  assert.equal(limit(access, "limit.ai.credits.month").value, 0);
});

function cohortCapability(cohort: string, effect: "allow" | "deny"): CapabilityAssignment {
  return {
    subject: { kind: "cohort", key: cohort },
    capabilityCode: "studio.timeline.access",
    effect,
    reason: "fixture",
  };
}

function withCapabilities(state: AccessState, capabilityAssignments: readonly CapabilityAssignment[]): AccessState {
  return { ...state, capabilityAssignments };
}

function capability(access: ReturnType<typeof resolveEffectiveAccess>, code: string) {
  const value = access.capabilities.find(({ code: candidate }) => candidate === code);
  assert.ok(value, `missing capability ${code}`);
  return value;
}

function limit(access: ReturnType<typeof resolveEffectiveAccess>, code: string) {
  const value = access.limits.find(({ code: candidate }) => candidate === code);
  assert.ok(value, `missing limit ${code}`);
  return value;
}
