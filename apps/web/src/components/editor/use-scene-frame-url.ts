import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  downloadSceneFrame, getSceneFrame, requestSceneFrame, type AuthSession, type Scene,
} from "../../api.js";
import { sceneFrameCacheKey, supportsSceneFrame } from "./scene-frame-model.js";
import { waitForSceneRender } from "./scene-render-polling.js";

export function useSceneFrameUrl(scene: Scene, storyId: string, session: AuthSession) {
  const [objectUrl, setObjectUrl] = useState<{ readonly blob: Blob; readonly url: string }>();
  const supported = supportsSceneFrame(scene);
  const frame = useQuery({
    queryKey: ["scene-frame", session.profile.id, storyId, scene.id, sceneFrameCacheKey(scene)],
    enabled: supported,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    queryFn: async ({ signal }) => {
      const initial = await requestSceneFrame(session.accessToken, storyId, scene.id, signal);
      const ready = await waitForSceneRender(initial, {
        signal,
        load: (frameId, requestSignal) => getSceneFrame(session.accessToken, storyId, scene.id, frameId, requestSignal),
      });
      return downloadSceneFrame(session.accessToken, storyId, scene.id, ready.id, signal);
    },
  });

  useEffect(() => {
    if (!frame.data) {
      setObjectUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(frame.data);
    setObjectUrl({ blob: frame.data, url });
    return () => URL.revokeObjectURL(url);
  }, [frame.data]);

  return {
    url: frame.data && objectUrl?.blob === frame.data ? objectUrl.url : undefined,
    loading: supported && frame.isPending,
    failed: supported && frame.isError,
    supported,
  };
}
