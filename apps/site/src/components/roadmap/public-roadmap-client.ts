import type { Locale } from "@storyteller/localization";
import type { PublicMilestone, PublicRoadmap } from "./roadmap-types.js";

const locales = ["en", "ru", "sr-Latn", "es"] as const satisfies readonly Locale[];
const milestoneStates = new Set<PublicMilestone["state"]>(["complete", "current", "planned"]);

type FetchRoadmap = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadPublicRoadmap(fetchImpl: FetchRoadmap = fetch): Promise<PublicRoadmap> {
  const response = await fetchImpl("/product-roadmap.json", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Product roadmap request failed with ${response.status}`);
  return parsePublicRoadmapResponse(await response.json());
}

export function parsePublicRoadmapResponse(value: unknown): PublicRoadmap {
  if (!isPublicRoadmap(value)) throw new Error("Invalid product roadmap response");
  return value;
}

function isPublicRoadmap(value: unknown): value is PublicRoadmap {
  if (!isRecord(value)
    || typeof value.sourceRevision !== "string"
    || !value.sourceRevision
    || !(value.currentMilestoneNumber === null || isPositiveInteger(value.currentMilestoneNumber))
    || !isProgress(value.overallProgress)
    || !Array.isArray(value.milestones)
    || !value.milestones.every(isPublicMilestone)) return false;

  const numbers = value.milestones.map(({ number }) => number);
  return new Set(numbers).size === numbers.length
    && (value.currentMilestoneNumber === null || numbers.includes(value.currentMilestoneNumber));
}

function isPublicMilestone(value: unknown): value is PublicMilestone {
  return isRecord(value)
    && isPositiveInteger(value.number)
    && isLocalizedText(value.title)
    && (value.estimatedCompletion === null || isEstimatedCompletion(value.estimatedCompletion))
    && hasValidProgress(value)
    && typeof value.state === "string"
    && milestoneStates.has(value.state as PublicMilestone["state"]);
}

function isEstimatedCompletion(value: unknown): value is NonNullable<PublicMilestone["estimatedCompletion"]> {
  return isRecord(value)
    && typeof value.month === "string"
    && /^\d{4}-\d{2}$/.test(value.month)
    && isLocalizedText(value.label);
}

function isLocalizedText(value: unknown): value is Readonly<Record<Locale, string>> {
  return isRecord(value) && locales.every((locale) => typeof value[locale] === "string" && value[locale].length > 0);
}

function isProgress(value: unknown): value is { readonly completed: number; readonly total: number; readonly percent: number } {
  return isRecord(value) && hasValidProgress(value);
}

function hasValidProgress(value: Record<string, unknown>): boolean {
  return isNonnegativeInteger(value.completed)
    && isNonnegativeInteger(value.total)
    && value.completed <= value.total
    && isNonnegativeInteger(value.percent)
    && value.percent <= 100;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
