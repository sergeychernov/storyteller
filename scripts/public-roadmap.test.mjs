import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createPublicRoadmap,
  createPublicRoadmapLoader,
  fetchGitHubMilestones,
  productRoadmapRepository,
} from "./public-roadmap.mjs";

function source(numbers = [1, 2, 3]) {
  const titles = Object.fromEntries(numbers.map((number) => [number, {
    en: `Title #${number}`,
    ru: `Название #${number}`,
    "sr-Latn": `Naslov #${number}`,
    es: `Título #${number}`,
  }]));
  return `# Product roadmap\n\nPRIVATE_DOCUMENT_NOTE\n\n<!-- product-roadmap-public-titles:\n${JSON.stringify(titles)}\n-->\n`;
}

function milestone(number, { open = 0, closed = 0, dueOn = null } = {}) {
  return {
    number,
    title: `GitHub milestone ${number}`,
    open_issues: open,
    closed_issues: closed,
    due_on: dueOn,
    description: "PRIVATE_MILESTONE_DESCRIPTION",
    creator: { login: "PRIVATE_USER" },
  };
}

test("calculates milestone and overall progress from GitHub issue counts", () => {
  const data = createPublicRoadmap(source(), [
    milestone(1, { open: 2, closed: 3 }),
    milestone(2, { open: 4, closed: 1 }),
    milestone(3, { open: 1 }),
  ]);
  assert.deepEqual(data.milestones.map(({ number, completed, total, percent, state }) => [number, completed, total, percent, state]), [
    [1, 3, 5, 60, "current"],
    [2, 1, 5, 20, "planned"],
    [3, 0, 1, 0, "planned"],
  ]);
  assert.equal(data.currentMilestoneNumber, 1);
  assert.deepEqual(data.overallProgress, { completed: 4, total: 11, percent: 36 });
  assert.match(data.sourceRevision, /^[a-f0-9]{12}$/);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE_/);
});

test("orders GitHub milestone numbers and advances past milestones with no open issues", () => {
  const data = createPublicRoadmap(source([11, 3, 6]), [
    milestone(11, { open: 1 }),
    milestone(3, { closed: 2 }),
    milestone(6, { open: 0, closed: 0 }),
  ]);
  assert.deepEqual(data.milestones.map(({ number, state }) => [number, state]), [
    [3, "complete"],
    [6, "current"],
    [11, "planned"],
  ]);
  assert.equal(data.currentMilestoneNumber, 6);
});

test("uses GitHub milestone due dates for localized completion months", () => {
  const data = createPublicRoadmap(source([1]), [milestone(1, {
    open: 1,
    dueOn: "2026-09-30T23:59:59Z",
  })]);
  assert.deepEqual(data.milestones[0].estimatedCompletion, {
    month: "2026-09",
    label: { en: "September 2026", ru: "сентябрь 2026", "sr-Latn": "septembar 2026", es: "septiembre 2026" },
  });
  assert.equal(createPublicRoadmap(source([1]), [milestone(1, { open: 1 })]).milestones[0].estimatedCompletion, null);
});

test("all closed issues complete the roadmap", () => {
  const data = createPublicRoadmap(source([1, 2]), [
    milestone(1, { closed: 2 }),
    milestone(2, { closed: 1 }),
  ]);
  assert.equal(data.currentMilestoneNumber, null);
  assert.ok(data.milestones.every(({ state }) => state === "complete"));
  assert.deepEqual(data.overallProgress, { completed: 3, total: 3, percent: 100 });
});

test("rejects mismatched configuration and malformed GitHub aggregates", () => {
  assert.throws(() => createPublicRoadmap(source([1]), []), /missing from GitHub/);
  assert.throws(() => createPublicRoadmap(source([1, 2]), [milestone(1)]), /missing from GitHub/);
  assert.throws(() => createPublicRoadmap(source([1, 2]), [milestone(1), milestone(1)]), /Duplicate/);
  assert.throws(() => createPublicRoadmap(source([1]).replace('"ru":"Название #1"', '"ru":""'), [milestone(1)]), /invalid ru title/);
  assert.throws(() => createPublicRoadmap(source([1]).replace("product-roadmap-public-titles:", "removed:"), [milestone(1)]), /public-titles block/);
  assert.throws(() => createPublicRoadmap(source([1]), [{ ...milestone(1), open_issues: -1 }]), /open issue count/);
  assert.throws(() => createPublicRoadmap(source([1]), [{ ...milestone(1), due_on: "not-a-date" }]), /due date/);
});

test("ignores GitHub milestones that are not configured as product roadmap milestones", () => {
  const data = createPublicRoadmap(source([1]), [milestone(1, { open: 1 }), milestone(99, { closed: 50 })]);
  assert.deepEqual(data.milestones.map(({ number }) => number), [1]);
  assert.deepEqual(data.overallProgress, { completed: 0, total: 1, percent: 0 });
});

test("revision changes only when public titles or GitHub milestone aggregates change", () => {
  const milestones = [milestone(1, { open: 2, closed: 1 })];
  const first = createPublicRoadmap(source([1]), milestones);
  const privateEdit = createPublicRoadmap(source([1]).replace("PRIVATE_DOCUMENT_NOTE", "ANOTHER_PRIVATE_NOTE"), milestones);
  const changed = createPublicRoadmap(source([1]), [milestone(1, { open: 1, closed: 2 })]);
  assert.equal(first.sourceRevision, privateEdit.sourceRevision);
  assert.notEqual(first.sourceRevision, changed.sourceRevision);
});

test("fetches the public GitHub milestones endpoint with optional server-only authorization", async () => {
  let request;
  const result = await fetchGitHubMilestones({
    repository: "owner/repo",
    token: "test-token",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => [milestone(1)] };
    },
  });
  assert.equal(request.url, "https://api.github.com/repos/owner/repo/milestones?state=all&per_page=100");
  assert.equal(request.options.headers.Authorization, "Bearer test-token");
  assert.equal(request.options.headers.Accept, "application/vnd.github+json");
  assert.equal(result.length, 1);
  await assert.rejects(() => fetchGitHubMilestones({ repository: "invalid", fetchImpl: async () => null }), /repository name/);
  await assert.rejects(() => fetchGitHubMilestones({
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }),
  }), /failed with 403/);
});

test("loader caches, deduplicates refreshes and serves stale data after a later GitHub failure", async () => {
  let timestamp = 0;
  let fetchCalls = 0;
  let releaseFirstFetch;
  const firstFetch = new Promise((resolve) => { releaseFirstFetch = resolve; });
  const loader = createPublicRoadmapLoader({
    readSource: async () => source([1]),
    fetchMilestones: async () => {
      fetchCalls++;
      if (fetchCalls === 1) {
        await firstFetch;
        return [milestone(1, { open: 1 })];
      }
      throw new Error("GitHub unavailable");
    },
    cacheTtlMs: 100,
    now: () => timestamp,
  });
  const first = loader();
  const concurrent = loader();
  releaseFirstFetch();
  assert.deepEqual(await first, await concurrent);
  assert.equal(fetchCalls, 1);
  assert.equal((await loader()).currentMilestoneNumber, 1);
  assert.equal(fetchCalls, 1);
  timestamp = 101;
  assert.equal((await loader()).currentMilestoneNumber, 1);
  assert.equal(fetchCalls, 2);
});

test("repository configuration contains public titles for the GitHub milestones", async () => {
  assert.equal(productRoadmapRepository, "sergeychernov/storyteller");
  const repositorySource = await readFile(new URL("../docs/product-roadmap.md", import.meta.url), "utf8");
  const fixture = [1, 2, 3, 4, 5, 6, 7].map((number) => ({
    ...milestone(number),
    title: `Descriptive GitHub milestone ${number}`,
  }));
  const data = createPublicRoadmap(repositorySource, fixture);
  assert.deepEqual(data.milestones.map(({ number }) => number), [1, 2, 3, 4, 5, 6, 7]);
});
