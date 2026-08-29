import { analytics } from "@storyteller/analytics";
import { useEffect } from "react";

export function useStoryWebAnalytics(profileId: string | undefined, page: string): void {
  useEffect(() => analytics.setUser(profileId), [profileId]);
  useEffect(() => analytics.trackPage(page), [page]);
}
