import { describe, expect, it } from "vitest";
import { filterEntries } from "./AccessReference.js";
import { accessReferenceCodes, getAccessReference, getAccessRules, type AccessReferenceKind } from "./access-reference.js";

const expectedCodes: Readonly<Record<AccessReferenceKind, readonly string[]>> = {
  role: ["creator", "access_manager"],
  capability: [
    "admin.console.access", "admin.users.list", "admin.users.read", "admin.users.activity.read",
    "admin.sessions.metadata.read", "admin.audit.read", "admin.access.explain", "admin.permissions.read",
    "admin.roles.read", "admin.cohorts.read", "admin.access.assign_role", "admin.access.assign_cohort",
    "admin.access.override", "admin.sessions.revoke", "studio.access", "story.list", "story.create",
    "story.read", "story.update", "story.delete", "media.upload", "scene.render", "story.export",
    "profile.platform_credentials.manage", "publish.youtube", "studio.timeline.access", "studio.collage.access",
    "studio.custom_layout.access", "studio.scene_groups.access", "mobile.access", "mcp.access",
    "ai.story_assist.use", "ai.music.generate", "ai.cover.generate", "developer.diagnostics.read",
  ],
  cohort: ["testers", "early_users", "ambassadors", "developers"],
  limit: [
    "limit.stories.active", "limit.storage.bytes", "limit.scene_renders.month",
    "limit.story_exports.month", "limit.ai.credits.month",
  ],
};

describe("Admin access reference", () => {
  it("documents every current role, capability, cohort and limit in RU and EN", () => {
    for (const kind of Object.keys(expectedCodes) as AccessReferenceKind[]) {
      expect([...accessReferenceCodes(kind)].sort()).toEqual([...expectedCodes[kind]].sort());
      for (const code of expectedCodes[kind]) {
        for (const locale of ["en", "ru"]) {
          expect(getAccessReference(kind, code, locale)).toMatchObject({ documented: true });
          expect(getAccessReference(kind, code, locale).description.length).toBeGreaterThanOrEqual(20);
        }
      }
    }
    expect(getAccessRules("ru")).toHaveLength(5);
    expect(getAccessRules("en")).toHaveLength(5);
  });

  it("shows a safe warning for a future undocumented catalog entry", () => {
    expect(getAccessReference("capability", "future.capability", "ru")).toMatchObject({
      documented: false,
      name: "Описание ещё не добавлено",
    });
  });

  it("searches catalog entries by localized purpose as well as code", () => {
    const entries = [{ id: "story.create", code: "story.create", archived: false }, {
      id: "admin.audit.read", code: "admin.audit.read", archived: false,
    }];
    expect(filterEntries("capability", entries, "новую историю", "ru").map(({ code }) => code)).toEqual(["story.create"]);
    expect(filterEntries("capability", entries, "audit", "en").map(({ code }) => code)).toEqual(["admin.audit.read"]);
  });
});
