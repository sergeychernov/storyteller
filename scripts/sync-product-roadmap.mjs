import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const roadmapUrl = new URL("../docs/product-roadmap.md", import.meta.url);
const platforms = ["Web", "Mobile", "MCP"];
const taskId = /^(?:B\d{2}|F\d{2}(?:\.\d+)*)$/;
const milestonePattern = /^P(?:0|[1-9]\d*)$/;
const badgeDirectory = "assets/product-roadmap";
const nextStart = "<!-- product-roadmap-next:start -->";
const nextEnd = "<!-- product-roadmap-next:end -->";

export function readRoadmapStatus(cell) {
  const value = cell.trim();
  const badge = value.match(/^!\[([^\]]+)\]\(([^\s)]+)(?: "(P(?:0|[1-9]\d*))")?\)$/);
  const completed = value.match(/^done \((P(?:0|[1-9]\d*))\)$/);
  const status = completed ? "done" : badge?.[1] ?? value;
  if (status !== "done" && status !== "n/a" && !milestonePattern.test(status)) {
    throw new Error(`Invalid product-roadmap status: ${value}`);
  }
  if (status === "done") {
    const milestone = completed?.[1] ?? badge?.[3] ?? badge?.[2]?.match(/\/next-(P(?:0|[1-9]\d*))\.svg$/)?.[1];
    if (!milestone) throw new Error(`Completed status must retain its milestone: use done (Pn), not ${value}`);
    return { status, milestone };
  }
  return { status, milestone: status === "n/a" ? null : status };
}

function makeBadge(status, isDone) {
  const width = Math.max(56, status.length * 9 + 20);
  const background = isDone ? "#dcfce7" : "#ffedd5";
  const foreground = isDone ? "#14532d" : "#7c2d12";
  const border = isDone ? "#22c55e" : "#f97316";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" viewBox="0 0 ${width} 24" role="img" aria-label="${status}">
  <title>${status}</title>
  <rect x="0.5" y="0.5" width="${width - 1}" height="23" rx="5" fill="${background}" stroke="${border}"/>
  <text x="${width / 2}" y="16" fill="${foreground}" font-family="Arial, sans-serif" font-size="13" font-weight="700" text-anchor="middle">${status}</text>
</svg>
`;
}

export function syncProductRoadmap(source) {
  const orderBlocks = [...source.matchAll(/<!-- product-roadmap-order:\s*([\s\S]*?)-->/g)];
  if (orderBlocks.length !== 1) throw new Error("Expected one product-roadmap-order block");
  const order = orderBlocks[0][1].trim().split(/\s+/);
  if (new Set(order).size !== order.length) throw new Error("Duplicate IDs in product-roadmap-order");

  const lines = source.split("\n");
  const tasks = [];
  for (const [lineIndex, line] of lines.entries()) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (!taskId.test(cells[0])) continue;
    if (cells.length !== 6) throw new Error(`Expected six columns for ${cells[0]}`);
    const states = cells.slice(2, 5).map(readRoadmapStatus);
    tasks.push({ id: cells[0], title: cells[1], cells, lineIndex, statuses: states.map((state) => state.status), milestones: states.map((state) => state.milestone) });
  }
  if (tasks.length === 0) throw new Error("No product-roadmap tasks found");
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (byId.size !== tasks.length) throw new Error("Duplicate task IDs");
  if (order.length !== tasks.length || order.some((id) => !byId.has(id))) {
    throw new Error("product-roadmap-order must contain every task ID exactly once");
  }

  // The milestone selects the product outcome; this explicit order selects task priority within it.
  const pending = order.flatMap((id) => {
    const task = byId.get(id);
    return task.statuses.flatMap((status, index) => milestonePattern.test(status)
      ? [{ id, title: task.title, platform: platforms[index], index, status }]
      : []);
  });
  const earliest = pending.reduce((minimum, item) => {
    const value = BigInt(item.status.slice(1));
    return minimum === null || value < minimum ? value : minimum;
  }, null);
  const next = pending.filter((item) => BigInt(item.status.slice(1)) === earliest).slice(0, 10);
  const selected = new Set(next.map((item) => `${item.id}:${item.index}`));
  const assets = new Map();

  for (const task of tasks) {
    for (const [index, status] of task.statuses.entries()) {
      const isDone = status === "done";
      if (isDone || selected.has(`${task.id}:${index}`)) {
        const asset = `${badgeDirectory}/${isDone ? "done" : `next-${status}`}.svg`;
        assets.set(asset, makeBadge(status, isDone));
        const title = isDone ? ` "${task.milestones[index]}"` : "";
        task.cells[index + 2] = `![${status}](${asset}${title})`;
      } else {
        task.cells[index + 2] = status;
      }
    }
    lines[task.lineIndex] = `| ${task.cells.join(" | ")} |`;
  }

  const summary = next.length === 0
    ? "Нет незавершённых задач с назначенным milestone."
    : [
      `Текущий milestone: **P${earliest}**. В очереди ${next.length} пар «задача + интерфейс».`,
      "",
      "| № | ID | Интерфейс | Задача |",
      "| --- | --- | --- | --- |",
      ...next.map((item, index) => `| ${index + 1} | ${item.id} | ${item.platform} | ${item.title} |`),
    ].join("\n");
  const updated = lines.join("\n");
  const start = updated.indexOf(nextStart);
  const end = updated.indexOf(nextEnd);
  if (start < 0 || end < start || updated.indexOf(nextStart, start + 1) >= 0 || updated.indexOf(nextEnd, end + 1) >= 0) {
    throw new Error("Expected one complete product-roadmap-next block");
  }
  const markdown = updated.slice(0, start + nextStart.length) + `\n\n${summary}\n\n` + updated.slice(end);
  return { markdown, assets, next, tasks };
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new Error("Usage: node scripts/sync-product-roadmap.mjs [--check]");
  }
  const check = args[0] === "--check";
  const source = await readFile(roadmapUrl, "utf8");
  const { markdown, assets, next } = syncProductRoadmap(source);
  const outputs = new Map([[roadmapUrl, markdown], ...[...assets].map(([path, svg]) => [new URL(path, roadmapUrl), svg])]);
  const stale = [];
  for (const [url, content] of outputs) {
    const path = fileURLToPath(url);
    let existing;
    try {
      existing = await readFile(path, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (existing === content) continue;
    stale.push(path);
    if (!check) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content);
    }
  }
  if (check && stale.length > 0) {
    throw new Error(`Product roadmap presentation is stale. Run node scripts/sync-product-roadmap.mjs:\n${stale.join("\n")}`);
  }
  console.log(`Product roadmap ${check ? "checked" : "synced"}: ${next.length} next task/interface pairs; ${stale.length} ${check ? "stale" : "updated"} files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
