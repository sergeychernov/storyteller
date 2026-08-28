import { createHash } from "node:crypto";
import { syncProductRoadmap } from "./sync-product-roadmap.mjs";

const locales = ["en", "ru", "sr-Latn"];

export function createPublicRoadmap(source) {
  const { tasks } = syncProductRoadmap(source);
  const titleBlocks = [...source.matchAll(/<!-- product-roadmap-public-titles:\s*([\s\S]*?)-->/g)];
  if (titleBlocks.length !== 1) throw new Error("Expected one product-roadmap-public-titles block");
  const titles = JSON.parse(titleBlocks[0][1]);
  if (!titles || typeof titles !== "object" || Array.isArray(titles)) throw new Error("Invalid public milestone titles");

  const ids = source.split("\n").flatMap((line) => {
    const match = line.match(/^\| (P(?:0|[1-9]\d*)) \| [^|]+ \| [^|]+ \|$/);
    return match ? [match[1]] : [];
  });
  if (ids.length === 0 || new Set(ids).size !== ids.length) throw new Error("Milestone table is missing or contains duplicate IDs");
  if (Object.keys(titles).length !== ids.length || ids.some((id) => !Object.hasOwn(titles, id))) {
    throw new Error("Public titles must match the milestone table exactly");
  }
  const counts = new Map(ids.map((id) => [id, { completed: 0, total: 0 }]));
  for (const task of tasks) {
    for (const [index, status] of task.statuses.entries()) {
      if (status === "n/a") continue;
      const id = task.milestones[index];
      const count = counts.get(id);
      if (!count) throw new Error(`Unknown milestone ${id} for ${task.id}`);
      count.total += 1;
      if (status === "done") count.completed += 1;
    }
  }

  ids.sort((left, right) => BigInt(left.slice(1)) < BigInt(right.slice(1)) ? -1 : 1);
  const milestones = ids.map((id) => {
    const title = Object.fromEntries(locales.map((locale) => {
      const label = titles[id]?.[locale];
      if (typeof label !== "string" || !label.trim() || label.length > 120) throw new Error(`Missing or invalid ${locale} title for ${id}`);
      return [locale, label.trim()];
    }));
    const { completed, total } = counts.get(id);
    return { id, title, completed, total, percent: total === 0 ? 0 : Math.floor(completed / total * 100), state: total > 0 && completed === total ? "complete" : "planned" };
  });
  const current = milestones.find((milestone) => milestone.state !== "complete");
  if (current) current.state = "current";

  // Only this allowlisted summary enters the browser bundle, never task notes or the document itself.
  return { sourceRevision: createHash("sha256").update(source).digest("hex").slice(0, 12), currentMilestoneId: current?.id ?? null, milestones };
}
