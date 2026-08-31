import type { Locale } from "@storyteller/localization";

export interface PublicMilestone {
  readonly number: number;
  readonly title: Readonly<Record<Locale, string>>;
  readonly estimatedCompletion: {
    readonly month: string;
    readonly label: Readonly<Record<Locale, string>>;
  } | null;
  readonly completed: number;
  readonly total: number;
  readonly percent: number;
  readonly state: "complete" | "current" | "planned";
}

export interface PublicRoadmap {
  readonly sourceRevision: string;
  readonly currentMilestoneNumber: number | null;
  readonly overallProgress: {
    readonly completed: number;
    readonly total: number;
    readonly percent: number;
  };
  readonly milestones: readonly PublicMilestone[];
}
