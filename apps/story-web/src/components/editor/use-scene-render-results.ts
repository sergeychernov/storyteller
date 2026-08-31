import { useQuery } from "@tanstack/react-query";
import { listSceneRenderResults, type AuthSession, type Scene } from "../../api.js";

export function useSceneRenderResults(scene: Scene, storyId: string, session: AuthSession) {
  return useQuery({
    queryKey: ["scene-render-results", session.profile.id, storyId, scene.id, scene],
    queryFn: ({ signal }) => listSceneRenderResults(session.accessToken, storyId, scene.id, signal),
    refetchInterval: (query) => query.state.data?.some(({ status }) => status === "queued" || status === "running") ? 800 : 2_000,
  });
}
