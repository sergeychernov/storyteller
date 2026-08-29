import { analytics } from "@storyteller/analytics";
import { useEffect } from "react";

export function useClipWebAnalytics(profileId: string | undefined): void {
  useEffect(() => analytics.setUser(profileId), [profileId]);
  useEffect(() => analytics.trackPage(profileId ? "clip-shell" : "authentication-redirect"), [profileId]);
}
