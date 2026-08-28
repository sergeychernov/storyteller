import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { build } from "vite";
import { createPublicRoadmap } from "./public-roadmap.mjs";
import { publicRoadmapPlugin } from "./vite-public-roadmap.mjs";

function fixture(rows, ids = ["P0", "P1", "P2", "P3"]) {
  const titles = Object.fromEntries(ids.map((id) => [id, { en: `Title ${id}`, ru: `Название ${id}`, "sr-Latn": `Naslov ${id}` }]));
  return [
    "# Product roadmap", "",
    "| Milestone | Product outcome | Completion criteria |", "| --- | --- | --- |",
    ...ids.map((id) => `| ${id} | Result ${id} | PRIVATE_ACCEPTANCE_NOTE |`), "",
    `<!-- product-roadmap-public-titles: ${JSON.stringify(titles)} -->`,
    `<!-- product-roadmap-order: ${rows.map(([id]) => id).join(" ")} -->`,
    "<!-- product-roadmap-next:start -->", "<!-- product-roadmap-next:end -->", "",
    "| ID | Task | Web | Mobile | MCP | Notes |", "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(([id, ...statuses]) => `| ${id} | PRIVATE_TASK_TITLE | ${statuses.join(" | ")} | PRIVATE_TASK_NOTE |`), "",
  ].join("\n");
}

test("counts task/interface pairs separately, excludes n/a and retains completed targets", () => {
  const data = createPublicRoadmap(fixture([["B01", "done (P0)", "done (P1)", "n/a"], ["F01", "P0", "P1", "P2"], ["F16.1", "P3", "n/a", "n/a"]]));
  assert.deepEqual(data.milestones.map(({ id, completed, total, state }) => [id, completed, total, state]), [
    ["P0", 1, 2, "current"], ["P1", 1, 2, "planned"], ["P2", 0, 1, "planned"], ["P3", 0, 1, "planned"],
  ]);
  assert.equal(data.currentMilestoneId, "P0");
  assert.equal(data.milestones[0].percent, 50);
  assert.match(data.sourceRevision, /^[a-f0-9]{12}$/);
  assert.doesNotMatch(JSON.stringify(data), /PRIVATE_/);
});

test("closing the final Web task advances the position to Mobile and then MCP", () => {
  const before = fixture([["F01", "P0", "P1", "P2"]], ["P0", "P1", "P2"]);
  const mobile = createPublicRoadmap(before.replace("| P0 | P1 | P2 |", "| done (P0) | P1 | P2 |"));
  assert.equal(mobile.currentMilestoneId, "P1");
  assert.equal(mobile.milestones[0].percent, 100);
  const mcp = createPublicRoadmap(before.replace("| P0 | P1 | P2 |", "| done (P0) | done (P1) | P2 |"));
  assert.equal(mcp.currentMilestoneId, "P2");
});

test("all complete has no current milestone; empty milestones do not claim completion", () => {
  const complete = createPublicRoadmap(fixture([["F01", "done (P0)", "n/a", "n/a"]], ["P0"]));
  assert.equal(complete.currentMilestoneId, null);
  assert.equal(complete.milestones[0].state, "complete");
  const empty = createPublicRoadmap(fixture([["F01", "done (P0)", "n/a", "n/a"]], ["P0", "P5"]));
  assert.equal(empty.currentMilestoneId, "P5");
  assert.equal(empty.milestones[1].percent, 0);
});

test("future milestones, rescheduling and partial later completion use document data", () => {
  const data = createPublicRoadmap(fixture([["F01", "done (P10)", "P5", "P10"]], ["P10", "P5"]));
  assert.deepEqual(data.milestones.map(({ id }) => id), ["P5", "P10"]);
  assert.equal(data.currentMilestoneId, "P5");
  assert.equal(data.milestones[1].completed, 1);
  assert.equal(data.milestones[1].title.ru, "Название P10");
});

test("invalid or incomplete source fails instead of manufacturing progress", () => {
  const source = fixture([["F01", "P0", "P1", "P2"]]);
  assert.throws(() => createPublicRoadmap(source.replace("| P0 | P1 | P2 |", "| done | P1 | P2 |")), /retain its milestone/);
  assert.throws(() => createPublicRoadmap(source.replace("| P0 | P1 | P2 |", "| P5 | P1 | P2 |")), /Unknown milestone/);
  assert.throws(() => createPublicRoadmap(source.replace('"ru":"Название P0"', '"ru":""')), /invalid ru title/);
  assert.throws(() => createPublicRoadmap(source.replace("product-roadmap-public-titles:", "removed:")), /public-titles block/);
  assert.throws(() => createPublicRoadmap(source.replace("| P3 | Result P3 | PRIVATE_ACCEPTANCE_NOTE |", "")), /match the milestone table/);
});

test("revision changes with the source, while identical input remains deterministic", () => {
  const source = fixture([["F01", "P0", "n/a", "n/a"]], ["P0"]);
  assert.deepEqual(createPublicRoadmap(source), createPublicRoadmap(source));
  assert.notEqual(createPublicRoadmap(source).sourceRevision, createPublicRoadmap(source + "\n").sourceRevision);
});

test("each Vite build rereads the document and bundles only public aggregates", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "storyteller-roadmap-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const roadmapPath = join(directory, "roadmap.md");
  const entry = join(directory, "entry.mjs");
  await writeFile(entry, 'export { default } from "virtual:product-roadmap";');
  const source = fixture([["F01", "P0", "P1", "P2"]], ["P0", "P1", "P2"]);
  async function bundle(markdown) {
    await writeFile(roadmapPath, markdown);
    const result = await build({ configFile: false, logLevel: "silent", plugins: [publicRoadmapPlugin(roadmapPath)], build: {
      write: false, minify: false, lib: { entry, formats: ["es"] },
    } });
    const output = (Array.isArray(result) ? result[0] : result).output;
    const code = output.find((item) => item.type === "chunk").code;
    assert.doesNotMatch(code, /PRIVATE_|product-roadmap-order/);
    return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)).default;
  }
  const first = await bundle(source);
  const second = await bundle(source.replace("| P0 | P1 | P2 |", "| done (P0) | P1 | P2 |"));
  assert.equal(first.currentMilestoneId, "P0");
  assert.equal(second.currentMilestoneId, "P1");
  assert.notEqual(first.sourceRevision, second.sourceRevision);
  await assert.rejects(() => bundle(source.replace("| P0 | P1 | P2 |", "| done | P1 | P2 |")), /retain its milestone/);
});

test("dev updates invalidate the virtual module only when the roadmap changes", () => {
  const plugin = publicRoadmapPlugin("/test/roadmap.md");
  const calls = [];
  const module = { id: "roadmap" };
  const context = { environment: { moduleGraph: { getModuleById: () => module, invalidateModule: (value) => calls.push(value) }, hot: { send: (message) => calls.push(message) } } };
  assert.equal(plugin.hotUpdate.call(context, { file: "/test/other.md" }), undefined);
  assert.deepEqual(calls, []);
  assert.deepEqual(plugin.hotUpdate.call(context, { file: "/test/roadmap.md" }), []);
  assert.deepEqual(calls, [module, { type: "full-reload" }]);
});

test("repository roadmap is valid input", async () => {
  const source = await readFile(new URL("../docs/product-roadmap.md", import.meta.url), "utf8");
  const data = createPublicRoadmap(source);
  assert.ok(data.milestones.length > 0);
  assert.ok(data.milestones.every(({ total, completed }) => completed <= total));
  assert.doesNotMatch(JSON.stringify(data.milestones.map(({ title }) => title)), /parity|паритет|paritet/i);
});
