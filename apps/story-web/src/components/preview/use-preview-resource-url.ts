import { useEffect, useState } from "react";
import {
  getMaterialAudioContent, getMaterialAudioContentAccess, getMaterialContent, getMaterialContentAccess,
  type AuthSession, type SceneMaterial,
} from "../../api.js";

interface PreviewResourceOptions {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly audio?: boolean;
  readonly retryKey: number;
}

interface PreviewResourceState {
  readonly url?: string;
  readonly loading: boolean;
  readonly failed: boolean;
}

/** Preview owns this request and every Blob URL; unmount is a hard resource boundary. */
export function usePreviewResourceUrl({ storyId, material, session, audio = false, retryKey }: PreviewResourceOptions): PreviewResourceState {
  const [state, setState] = useState<PreviewResourceState>({ loading: true, failed: false });
  const storageKey = audio && material.kind === "video" ? material.audioTrack?.storageKey
    : material.edit?.result?.storageKey ?? (material.kind === "video" ? material.videoTrack?.storageKey ?? material.storageKey : material.storageKey);

  useEffect(() => {
    if (!storageKey) {
      setState({ loading: false, failed: false });
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setState({ loading: true, failed: false });
    void (async () => {
      try {
        const access = audio
          ? await getMaterialAudioContentAccess(session.csrfToken, storyId, material.id, controller.signal)
          : await getMaterialContentAccess(session.csrfToken, storyId, material.id, controller.signal);
        if (controller.signal.aborted) return;
        if (access.url) {
          setState({ url: access.url, loading: false, failed: false });
          return;
        }
        const blob = audio
          ? await getMaterialAudioContent(session.csrfToken, storyId, material.id, controller.signal)
          : await getMaterialContent(session.csrfToken, storyId, material.id, controller.signal);
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, failed: false });
      } catch (error) {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          setState({ loading: false, failed: true });
        }
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audio, material.id, retryKey, session.csrfToken, storageKey, storyId]);

  return state;
}

export function prefersMetadataFirstPreload(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { readonly saveData?: boolean; readonly effectiveType?: string } }).connection;
  return Boolean(connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g");
}
