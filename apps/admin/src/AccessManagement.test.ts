import { describe, expect, it } from "vitest";
import { buildAccessOperation } from "./AccessManagement.js";
import { summarizeAuditChange } from "./Audit.js";

describe("access management form", () => {
  it("builds an ISO-timed capability override", () => {
    expect(buildAccessOperation({
      type: "set_capability_override", code: "story.create", effect: "deny", limitOperation: "add", value: "0",
      startsAt: "2026-09-01T12:30", expiresAt: "2026-10-01T00:00",
    })).toEqual({
      type: "set_capability_override", capabilityCode: "story.create", effect: "deny",
      startsAt: new Date("2026-09-01T12:30").toISOString(), expiresAt: new Date("2026-10-01T00:00").toISOString(),
    });
  });

  it("accepts unlimited and rejects invalid numeric limits", () => {
    expect(buildAccessOperation({
      type: "set_limit_override", code: "limit.storage.bytes", effect: "allow", limitOperation: "replace", value: "unlimited",
      startsAt: "", expiresAt: "",
    })).toEqual({ type: "set_limit_override", limitCode: "limit.storage.bytes", operation: "replace", value: "unlimited" });
    expect(() => buildAccessOperation({
      type: "set_limit_override", code: "limit.storage.bytes", effect: "allow", limitOperation: "replace", value: "1.5",
      startsAt: "", expiresAt: "",
    })).toThrow(/non-negative integer/);
  });

  it("shows only typed safe audit fields", () => {
    const summary = summarizeAuditChange({
      before: { capability_code: "story.create", effect: "allow", created_by: "secret-actor" },
      after: { capability_code: "story.create", effect: "deny", token_hash: "must-not-leak" },
    });
    expect(summary).toContain("story.create");
    expect(summary).toContain("deny");
    expect(summary).not.toContain("secret-actor");
    expect(summary).not.toContain("must-not-leak");
  });
});
