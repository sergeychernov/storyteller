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
  readonly lifecycle?: "cached" | "owned";
  readonly retryKey?: number;
  readonly enabled?: boolean;
}

/** Canonical loader for editor and playback media; ownership only changes cache lifetime. */
export function useMaterialContentUrl({
  storyId,
  material,
  session,
  source = false,
  audio = false,
  lifecycle = "cached",
  retryKey = 0,
  enabled = true,
}: UseMaterialContentUrlOptions) {
  const [objectUrl, setObjectUrl] = useState<{ readonly blob: Blob; readonly url: string }>();
  const storageKey = !enabled ? undefined : audio ? material.kind === "video" ? material.audioTrack?.storageKey : undefined
    : (source ? getMaterialSource(material) : getMaterialPresentation(material)).storageKey;
  const contentKind = audio ? "audio" : source ? "source" : "presentation";
  const owned = lifecycle === "owned";
  const content = useQuery({
    queryKey: ["material-content", lifecycle, contentKind, session.profile.id, storyId, material.id, storageKey,
      owned ? retryKey : 0],
    enabled: Boolean(storageKey),
    queryFn: async ({ signal }) => {
      const access = audio ? await getMaterialAudioContentAccess(session.csrfToken, storyId, material.id, signal) : source
        ? await getMaterialSourceContentAccess(session.csrfToken, storyId, material.id, signal)
        : await getMaterialContentAccess(session.csrfToken, storyId, material.id, signal);
      return access.url ?? (audio ? getMaterialAudioContent(session.csrfToken, storyId, material.id, signal) : source
        ? getMaterialSourceContent(session.csrfToken, storyId, material.id, signal)
        : getMaterialContent(session.csrfToken, storyId, material.id, signal));
    },
    staleTime: owned ? 0 : 45 * 60 * 1_000,
    gcTime: owned ? 0 : 5 * 60 * 1_000,
    refetchInterval: owned ? false : 45 * 60 * 1_000,
    retry: owned ? false : 3,
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
  return { url, loading: Boolean(storageKey) && content.isPending, failed: content.isError };
}

export function prefersMetadataFirstPreload(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & {
    connection?: { readonly saveData?: boolean; readonly effectiveType?: string };
  }).connection;
  return Boolean(connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g");
}
