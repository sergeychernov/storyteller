import assert from "node:assert/strict";
import test from "node:test";
import { createBaselineAccessState, resolveEffectiveAccess } from "@storyteller/application";
import { applyOperation } from "./admin-access.js";

const profileId = "00000000-0000-4000-8000-000000000001";

test("admin access operations create deterministic previews and recognize no-op state", () => {
  const baseline = createBaselineAccessState(profileId);
  const operation = {
    type: "set_capability_override" as const,
    capabilityCode: "story.create",
    effect: "deny" as const,
    startsAt: "2026-09-01T12:00:00.000Z",
  };
  const changed = applyOperation(baseline, operation, "support hold");
  assert.equal(changed.changed, true);
  assert.equal(resolveEffectiveAccess(changed.state, new Date("2026-09-01T12:01:00.000Z"))
    .capabilities.find(({ code }) => code === "story.create")?.allowed, false);

  const noOp = applyOperation(changed.state, operation, "support hold");
  assert.equal(noOp.changed, false);
  assert.equal(noOp.state, changed.state);

  const removed = applyOperation(noOp.state, { type: "remove_capability_override", capabilityCode: "story.create" }, "hold cleared");
  assert.equal(removed.changed, true);
  assert.equal(resolveEffectiveAccess(removed.state, new Date("2026-09-01T12:01:00.000Z"))
    .capabilities.find(({ code }) => code === "story.create")?.allowed, true);
});

test("admin access operations support timed memberships and typed limit values", () => {
  const baseline = createBaselineAccessState(profileId);
  const membership = applyOperation(baseline, {
    type: "set_cohort_membership", cohortCode: "early_users",
    startsAt: "2026-09-02T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z",
  }, "campaign");
  assert.deepEqual(membership.state.memberships, [{
    cohortCode: "early_users", reason: "campaign",
    startsAt: "2026-09-02T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z",
  }]);

  const limited = applyOperation(membership.state, {
    type: "set_limit_override", limitCode: "limit.story_exports.month", operation: "replace", value: "unlimited",
    startsAt: "2026-09-01T12:00:00.000Z",
  }, "temporary unlimited export");
  assert.equal(resolveEffectiveAccess(limited.state, new Date("2026-09-01T13:00:00.000Z"))
    .limits.find(({ code }) => code === "limit.story_exports.month")?.value, "unlimited");
});
