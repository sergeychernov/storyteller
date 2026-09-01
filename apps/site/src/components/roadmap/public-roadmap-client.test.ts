import assert from "node:assert/strict";
import test from "node:test";
import { loadPublicRoadmap, parsePublicRoadmapResponse } from "./public-roadmap-client.js";

const validRoadmap = {
  sourceRevision: "abc123def456",
  currentMilestoneNumber: 1,
  overallProgress: { completed: 2, total: 5, percent: 40 },
  milestones: [{
    number: 1,
    title: { en: "Web", ru: "Веб", "sr-Latn": "Veb", es: "Web" },
    estimatedCompletion: null,
    completed: 2,
    total: 5,
    percent: 40,
    state: "current",
  }],
} as const;

test("public roadmap parser accepts the complete response contract", () => {
  assert.equal(parsePublicRoadmapResponse(validRoadmap), validRoadmap);
});

test("public roadmap parser rejects missing top-level fields used by the UI", () => {
  const { currentMilestoneNumber: _current, ...withoutCurrent } = validRoadmap;
  const { overallProgress: _progress, ...withoutProgress } = validRoadmap;

  assert.throws(() => parsePublicRoadmapResponse(withoutCurrent), /Invalid product roadmap response/);
  assert.throws(() => parsePublicRoadmapResponse(withoutProgress), /Invalid product roadmap response/);
});

test("roadmap loader rejects a malformed successful server response", async () => {
  await assert.rejects(
    loadPublicRoadmap(async () => new Response(JSON.stringify({ milestones: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })),
    /Invalid product roadmap response/,
  );
});
