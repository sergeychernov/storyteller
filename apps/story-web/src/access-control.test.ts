import assert from "node:assert/strict";
import test from "node:test";
import { hasCapability } from "./access-control.js";
import type { EffectiveAccess } from "./api.js";

const access: EffectiveAccess = {
  planVersionCode: "free-v1",
  roles: ["creator"],
  capabilities: [
    { code: "studio.access", allowed: true, sources: [] },
    { code: "story.create", allowed: false, sources: [] },
  ],
  limits: [],
  evaluatedAt: "2026-08-29T12:00:00.000Z",
};

test("Web capability checks require an explicit allowed decision", () => {
  assert.equal(hasCapability(access, "studio.access"), true);
  assert.equal(hasCapability(access, "story.create"), false);
  assert.equal(hasCapability(access, "unknown.capability"), false);
});
