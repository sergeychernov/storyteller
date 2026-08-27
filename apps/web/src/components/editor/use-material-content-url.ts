import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getMaterialContent, getMaterialContentAccess, getMaterialSourceContent, getMaterialSourceContentAccess,
  type AuthSession, type SceneMaterial,
} from "../../api.js";

interface UseMaterialContentUrlOptions {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly source?: boolean;
}

export function useMaterialContentUrl({ storyId, material, session, source = false }: UseMaterialContentUrlOptions) {
  const [objectUrl, setObjectUrl] = useState<{ readonly blob: Blob; readonly url: string }>();
  const storageKey = source ? material.storageKey : material.edit?.result.storageKey ?? material.storageKey;
  const content = useQuery({
    queryKey: [source ? "material-source-content" : "material-content", storyId, material.id, storageKey],
    queryFn: async () => {
      const access = source
        ? await getMaterialSourceContentAccess(session.accessToken, storyId, material.id)
        : await getMaterialContentAccess(session.accessToken, storyId, material.id);
      return access.url ?? (source
        ? getMaterialSourceContent(session.accessToken, storyId, material.id)
        : getMaterialContent(session.accessToken, storyId, material.id));
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
