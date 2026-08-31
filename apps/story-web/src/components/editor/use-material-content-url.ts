import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getMaterialAudioContent, getMaterialAudioContentAccess, getMaterialContent, getMaterialContentAccess,
  getMaterialPresentation, getMaterialSource, getMaterialSourceContent, getMaterialSourceContentAccess,
  type AuthSession, type SceneMaterial,
} from "../../api.js";

interface UseMaterialContentUrlOptions {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly source?: boolean;
  readonly audio?: boolean;
}

export function useMaterialContentUrl({ storyId, material, session, source = false, audio = false }: UseMaterialContentUrlOptions) {
  const [objectUrl, setObjectUrl] = useState<{ readonly blob: Blob; readonly url: string }>();
  const storageKey = audio ? material.kind === "video" ? material.audioTrack?.storageKey : undefined
    : (source ? getMaterialSource(material) : getMaterialPresentation(material)).storageKey;
  const content = useQuery({
    queryKey: [audio ? "material-audio-content" : source ? "material-source-content" : "material-content", session.profile.id, storyId, material.id, storageKey],
    enabled: Boolean(storageKey),
    queryFn: async () => {
      const access = audio ? await getMaterialAudioContentAccess(session.csrfToken, storyId, material.id) : source
        ? await getMaterialSourceContentAccess(session.csrfToken, storyId, material.id)
        : await getMaterialContentAccess(session.csrfToken, storyId, material.id);
      return access.url ?? (audio ? getMaterialAudioContent(session.csrfToken, storyId, material.id) : source
        ? getMaterialSourceContent(session.csrfToken, storyId, material.id)
        : getMaterialContent(session.csrfToken, storyId, material.id));
    },
    staleTime: 45 * 60 * 1_000,
    refetchInterval: 45 * 60 * 1_000,
  });

  useEffect(() => {
    if (!content.data || typeof content.data === "string") {
      setObjectUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(content.data);
    setObjectUrl({ blob: content.data, url });
    return () => URL.revokeObjectURL(url);
  }, [content.data]);

  // Never display the previous version with the next version's dimensions while loading.
  const url = typeof content.data === "string" ? content.data
    : content.data && objectUrl?.blob === content.data ? objectUrl.url : undefined;
  return { url, loading: content.isPending, failed: content.isError };
}
