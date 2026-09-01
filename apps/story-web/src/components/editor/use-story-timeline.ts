import { useQuery } from "@tanstack/react-query";
import { getStoryTimeline, type AuthSession } from "../../api.js";

export function useStoryTimeline(session: AuthSession, storyId: string, revision: number) {
  return useQuery({
    queryKey: ["story-timeline", session.profile.id, storyId, revision] as const,
    queryFn: ({ signal }) => getStoryTimeline(session.csrfToken, storyId, signal),
  });
}
