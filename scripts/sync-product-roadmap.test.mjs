import assert from "node:assert/strict";
import test from "node:test";
import { readRoadmapStatus, syncProductRoadmap } from "./sync-product-roadmap.mjs";

function fixture(rows, order = rows.map((row) => row[0])) {
  return [
    "# Product Roadmap",
    "",
    `<!-- product-roadmap-order: ${order.join(" ")} -->`,
    "<!-- product-roadmap-next:start -->",
    "Outdated queue",
    "<!-- product-roadmap-next:end -->",
    "",
    "| ID | Task | Web | Mobile | MCP | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map(([id, web, mobile = "P1", mcp = "P2"]) => {
      const cells = [web, mobile, mcp].map((status, index) => status === "done" ? `done (P${index})` : status);
      return `| ${id} | Task ${id} | ${cells.join(" | ")} | Keep this evidence. |`;
    }),
    "",
    "Unrelated paragraph stays unchanged.",
    "",
  ].join("\n");
}

function taskLine(markdown, id) {
  return markdown.split("\n").find((line) => line.startsWith(`| ${id} |`));
}

test("green done, orange next: platform statuses remain independent", () => {
  const result = syncProductRoadmap(fixture([["B01", "done", "done", "n/a"], ["B02", "done", "P1", "P2"]]));
  assert.equal(result.next.length, 1);
  assert.equal(result.next[0].platform, "Mobile");
  assert.match(result.markdown, /Текущий milestone: \*\*P1\*\*/);
  assert.match(taskLine(result.markdown, "B02"), /!\[done\]\(assets\/product-roadmap\/done.svg "P0"\) \| !\[P1\]\(assets\/product-roadmap\/next-P1.svg\) \| P2/);
  assert.equal((taskLine(result.markdown, "B01").match(/!\[done\]/g) ?? []).length, 2);
  assert.match(result.assets.get("assets/product-roadmap/done.svg"), /fill="#dcfce7"/);
  assert.match(result.assets.get("assets/product-roadmap/next-P1.svg"), /fill="#ffedd5"/);
});

test("select exactly ten pairs in explicit order, not table order", () => {
  const rows = Array.from({ length: 12 }, (_, i) => [`F${String(i + 1).padStart(2, "0")}`, "P0"]);
  const order = rows.map(([id]) => id).reverse();
  const result = syncProductRoadmap(fixture(rows, order));
  assert.deepEqual(result.next.map(({ id }) => id), order.slice(0, 10));
  assert.ok(result.next.every(({ platform }) => platform === "Web"));
  assert.equal((result.markdown.match(/!\[P0\]/g) ?? []).length, 10);
  assert.match(taskLine(result.markdown, "F01"), /\| P0 \| P1 \| P2 \|/);
});

test("completion updates green and brings the eleventh pair into orange", () => {
  const rows = Array.from({ length: 11 }, (_, i) => [`F${String(i + 1).padStart(2, "0")}`, "P0"]);
  const first = syncProductRoadmap(fixture(rows));
  const changed = first.markdown.replace("![P0](assets/product-roadmap/next-P0.svg)", "![done](assets/product-roadmap/next-P0.svg)");
  const second = syncProductRoadmap(changed);
  assert.equal(second.next.length, 10);
  assert.equal(second.next.at(-1).id, "F11");
  assert.match(taskLine(second.markdown, "F01"), /!\[done\]\(assets\/product-roadmap\/done.svg "P0"\) \| P1 \| P2/);
  assert.match(taskLine(second.markdown, "F11"), /!\[P0\]/);
});

test("fewer than ten remaining does not pull later releases forward", () => {
  const result = syncProductRoadmap(fixture([["B01", "P0"], ["B02", "done"]]));
  assert.equal(result.next.length, 1);
  assert.equal(result.next[0].platform, "Web");
  assert.match(taskLine(result.markdown, "B02"), /\| P1 \| P2 \|/);
});

test("complete Web advances to Mobile, then MCP", () => {
  const mobile = syncProductRoadmap(fixture([["B01", "done", "P1", "P2"]]));
  assert.equal(mobile.next[0].platform, "Mobile");
  const mcp = syncProductRoadmap(fixture([["B01", "done", "done", "P2"]]));
  assert.equal(mcp.next[0].platform, "MCP");
});

test("Pn is unbounded and numeric rather than lexicographic", () => {
  const result = syncProductRoadmap(fixture([["F01", "P10", "n/a", "n/a"], ["F02", "P5", "n/a", "n/a"]]));
  assert.equal(result.next[0].id, "F02");
  assert.match(result.markdown, /next-P5.svg/);
  const later = syncProductRoadmap(fixture([["F01", "P123", "n/a", "n/a"]]));
  assert.match(later.assets.get("assets/product-roadmap/next-P123.svg"), /<title>P123<\/title>/);
});

test("parallel feature pairs are ordered Web, Mobile, MCP", () => {
  const result = syncProductRoadmap(fixture([["F01", "P3", "P3", "P3"], ["F02", "P3", "P3", "P3"]]));
  assert.deepEqual(result.next.map(({ id, platform }) => `${id}:${platform}`), ["F01:Web", "F01:Mobile", "F01:MCP", "F02:Web", "F02:Mobile", "F02:MCP"]);
});

test("no pending tasks removes stale orange without affecting done or n/a", () => {
  const result = syncProductRoadmap(fixture([["F01", "![done](assets/product-roadmap/next-P0.svg)", "n/a", "done"]]));
  assert.equal(result.next.length, 0);
  assert.doesNotMatch(result.markdown, /next-P0.svg/);
  assert.match(result.markdown, /Нет незавершённых задач с назначенным milestone/);
  assert.match(taskLine(result.markdown, "F01"), /\| n\/a \|/);
});

test("rescheduling removes stale badge and keeps the new milestone", () => {
  const result = syncProductRoadmap(fixture([["F01", "![P5](assets/product-roadmap/next-P0.svg)"], ["F02", "P0"]]));
  assert.equal(result.next[0].id, "F02");
  assert.match(taskLine(result.markdown, "F01"), /\| P5 \| P1 \| P2 \|/);
});

test("sync is idempotent and preserves evidence, prose and status values", () => {
  const original = fixture([["F01.1", "done"], ["F08.1.1", "P0"]]);
  const first = syncProductRoadmap(original);
  const second = syncProductRoadmap(first.markdown);
  assert.equal(second.markdown, first.markdown);
  assert.deepEqual(second.assets, first.assets);
  assert.deepEqual(second.tasks.map(({ statuses }) => statuses), [["done", "P1", "P2"], ["P0", "P1", "P2"]]);
  assert.deepEqual(second.tasks.map(({ milestones }) => milestones), [["P0", "P1", "P2"], ["P0", "P1", "P2"]]);
  assert.match(second.markdown, /Unrelated paragraph stays unchanged\./);
  assert.equal((second.markdown.match(/Keep this evidence\./g) ?? []).length, 2);
});

test("done retains its milestone through plain text, badge and repeated sync", () => {
  assert.deepEqual(readRoadmapStatus("done (P5)"), { status: "done", milestone: "P5" });
  assert.deepEqual(readRoadmapStatus('![done](assets/product-roadmap/done.svg "P5")'), { status: "done", milestone: "P5" });
  assert.deepEqual(readRoadmapStatus("![done](assets/product-roadmap/next-P5.svg)"), { status: "done", milestone: "P5" });
  assert.throws(() => readRoadmapStatus("done"), /retain its milestone/);
  assert.throws(() => readRoadmapStatus("![done](assets/product-roadmap/done.svg)"), /retain its milestone/);
  const first = syncProductRoadmap(fixture([["F01", "done (P5)", "n/a", "n/a"]]));
  assert.equal(syncProductRoadmap(first.markdown).markdown, first.markdown);
});

test("reject invalid statuses instead of guessing", () => {
  for (const invalid of ["DONE", "P-1", "P01", "partial", "", "![P0](bad path)"]) {
    assert.throws(() => syncProductRoadmap(fixture([["F01", invalid]])), /Invalid product-roadmap status/);
  }
});

test("reject duplicate, unknown or missing IDs and malformed marker blocks", () => {
  const source = fixture([["F01", "P0"], ["F02", "P0"]]);
  assert.throws(() => syncProductRoadmap(source.replace("F01 F02 -->", "F01 F01 -->")), /Duplicate IDs/);
  assert.throws(() => syncProductRoadmap(source.replace("F01 F02 -->", "F01 F99 -->")), /every task ID/);
  assert.throws(() => syncProductRoadmap(source.replace("F01 F02 -->", "F01 -->")), /every task ID/);
  assert.throws(() => syncProductRoadmap(source.replace("| F02 | Task", "| F01 | Task")), /Duplicate task IDs/);
  assert.throws(() => syncProductRoadmap(source.replace("product-roadmap-order:", "removed:")), /product-roadmap-order block/);
  assert.throws(() => syncProductRoadmap(source.replace("<!-- product-roadmap-next:end -->", "")), /product-roadmap-next block/);
  assert.throws(() => syncProductRoadmap(source + "<!-- product-roadmap-next:start -->"), /product-roadmap-next block/);
});
