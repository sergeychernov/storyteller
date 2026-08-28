import { useQuery } from "@tanstack/react-query";
import { listSceneRenderVersions, type AuthSession, type Scene } from "../../api.js";

export function useSceneRenderVersions(scene: Scene, storyId: string, session: AuthSession) {
  return useQuery({
    queryKey: ["scene-render-versions", session.profile.id, storyId, scene.id, scene],
    queryFn: ({ signal }) => listSceneRenderVersions(session.accessToken, storyId, scene.id, signal),
    refetchInterval: 2_000,
  });
}
