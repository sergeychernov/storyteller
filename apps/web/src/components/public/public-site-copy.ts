import type { Locale } from "@storyteller/localization";
import { publicSite } from "./public-site-model.js";

const roadmapKeys = ["roadmap", "roadmapIntro", "current", "planned", "complete", "allComplete", "tasks", "scopePending", "progressNote", "updated"] as const;
export type PublicSiteCopy = Pick<(typeof publicSite.locales)["en"], (typeof roadmapKeys)[number]>;

export function getPublicSiteCopy(locale: Locale): PublicSiteCopy {
  const localeData = publicSite.locales[locale];
  return Object.fromEntries(roadmapKeys.map((key) => [key, localeData[key]])) as unknown as PublicSiteCopy;
}
