import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const locales = ["en", "ru", "sr-Latn", "es"];
const milestoneNumberPattern = /^[1-9]\d*$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const defaultSourceUrl = new URL("../docs/product-roadmap.md", import.meta.url);

export const productRoadmapRepository = "sergeychernov/storyteller";
export const productRoadmapCacheTtlMs = 5 * 60 * 1000;

function readPublicTitles(source) {
  const blocks = [...source.matchAll(/<!-- product-roadmap-public-titles:\s*([\s\S]*?)-->/g)];
  if (blocks.length !== 1) throw new Error("Expected one product-roadmap-public-titles block");
  const titles = JSON.parse(blocks[0][1]);
  if (!titles || typeof titles !== "object" || Array.isArray(titles)) throw new Error("Invalid public milestone titles");
  return titles;
}

function localizedMonth(dueOn, number) {
  if (dueOn === null || dueOn === undefined) return null;
  if (typeof dueOn !== "string") throw new Error(`Invalid due date for milestone #${number}`);
  const date = new Date(dueOn);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid due date for milestone #${number}`);
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = Object.fromEntries(locales.map((locale) => {
    const parts = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).formatToParts(date);
    return [locale, parts.filter(({ type }) => type === "month" || type === "year").map(({ value }) => value).join(" ")];
  }));
  return { month, label };
}

function normalizeMilestone(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid GitHub milestone");
  const githubTitle = raw.title;
  if (typeof githubTitle !== "string" || !githubTitle.trim()) throw new Error("Invalid GitHub milestone title");
  if (!Number.isInteger(raw.number) || raw.number <= 0) throw new Error(`Invalid GitHub milestone number for ${githubTitle}`);
  if (!Number.isInteger(raw.open_issues) || raw.open_issues < 0) throw new Error(`Invalid open issue count for ${githubTitle}`);
  if (!Number.isInteger(raw.closed_issues) || raw.closed_issues < 0) throw new Error(`Invalid closed issue count for ${githubTitle}`);
  return {
    githubTitle: githubTitle.trim(),
    number: raw.number,
    open: raw.open_issues,
    completed: raw.closed_issues,
    dueOn: raw.due_on ?? null,
  };
}

export function createPublicRoadmap(source, githubMilestones) {
  if (!Array.isArray(githubMilestones)) throw new Error("GitHub milestones must be an array");
  const titles = readPublicTitles(source);
  const githubByNumber = new Map();
  for (const milestone of githubMilestones.map(normalizeMilestone)) {
    if (githubByNumber.has(milestone.number)) throw new Error("Duplicate GitHub milestone numbers");
    githubByNumber.set(milestone.number, milestone);
  }
  const configuredNumbers = Object.keys(titles);
  if (configuredNumbers.some((number) => !milestoneNumberPattern.test(number))) {
    throw new Error("Invalid GitHub milestone number in public titles");
  }
  if (configuredNumbers.length === 0) throw new Error("No product roadmap milestones configured");
  configuredNumbers.sort((left, right) => Number(left) - Number(right));
  if (configuredNumbers.some((number) => !githubByNumber.has(Number(number)))) {
    throw new Error("Configured product roadmap milestone is missing from GitHub");
  }
  const normalized = configuredNumbers.map((number) => githubByNumber.get(Number(number)));
  const milestones = normalized.map((milestone) => {
    const title = Object.fromEntries(locales.map((locale) => {
      const label = titles[milestone.number]?.[locale];
      if (typeof label !== "string" || !label.trim() || label.length > 120) {
        throw new Error(`Missing or invalid ${locale} title for milestone #${milestone.number}`);
      }
      return [locale, label.trim()];
    }));
    const total = milestone.open + milestone.completed;
    return {
      number: milestone.number,
      title,
      estimatedCompletion: localizedMonth(milestone.dueOn, milestone.number),
      completed: milestone.completed,
      total,
      percent: total === 0 ? 0 : Math.floor(milestone.completed / total * 100),
      state: total > 0 && milestone.open === 0 ? "complete" : "planned",
    };
  });
  const current = milestones.find((milestone) => milestone.state !== "complete");
  if (current) current.state = "current";
  const overallCompleted = milestones.reduce((sum, milestone) => sum + milestone.completed, 0);
  const overallTotal = milestones.reduce((sum, milestone) => sum + milestone.total, 0);
  const revisionSource = JSON.stringify({
    titles,
    milestones: normalized.map(({ number, open, completed, dueOn }) => ({ number, open, completed, dueOn })),
  });

  // Only this allowlisted aggregate enters the public response. Issue titles, bodies, labels and users are never returned.
  return {
    sourceRevision: createHash("sha256").update(revisionSource).digest("hex").slice(0, 12),
    currentMilestoneNumber: current?.number ?? null,
    overallProgress: {
      completed: overallCompleted,
      total: overallTotal,
      percent: overallTotal === 0 ? 0 : Math.floor(overallCompleted / overallTotal * 100),
    },
    milestones,
  };
}

export async function fetchGitHubMilestones({
  repository = productRoadmapRepository,
  fetchImpl = fetch,
  token = process.env.PRODUCT_ROADMAP_GITHUB_TOKEN,
  timeoutMs = 10_000,
} = {}) {
  if (!repositoryPattern.test(repository)) throw new Error("Invalid GitHub repository name");
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "storyteller-product-roadmap",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/milestones?state=all&per_page=100`, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`GitHub milestones request failed with ${response.status}`);
  const milestones = await response.json();
  if (!Array.isArray(milestones)) throw new Error("Invalid GitHub milestones response");
  if (milestones.length === 100) throw new Error("More than 100 GitHub milestones require pagination support");
  return milestones;
}

export function createPublicRoadmapLoader({
  readSource = () => readFile(defaultSourceUrl, "utf8"),
  fetchMilestones = () => fetchGitHubMilestones(),
  cacheTtlMs = productRoadmapCacheTtlMs,
  now = Date.now,
} = {}) {
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) throw new Error("Invalid product roadmap cache TTL");
  let cache = null;
  let refresh = null;

  return async function loadPublicRoadmap() {
    const timestamp = now();
    if (cache && timestamp - cache.loadedAt < cacheTtlMs) return cache.data;
    if (refresh) return refresh;
    refresh = (async () => {
      try {
        const [source, milestones] = await Promise.all([readSource(), fetchMilestones()]);
        const data = createPublicRoadmap(source, milestones);
        cache = { data, loadedAt: timestamp };
        return data;
      } catch (error) {
        if (cache) return cache.data;
        throw error;
      } finally {
        refresh = null;
      }
    })();
    return refresh;
  };
}

export const loadPublicRoadmap = createPublicRoadmapLoader();
