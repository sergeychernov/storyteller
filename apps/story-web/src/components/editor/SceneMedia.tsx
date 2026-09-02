import { forwardRef, useEffect } from "react";
import type { AuthSession } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import mediaStyles from "./MaterialThumbnail.module.css";
import type { ScenePlaybackSlot } from "./scene-playback-plan.js";
import type { SceneResourceEvent } from "./scene-resource-model.js";
import { SceneVideo } from "./SceneVideo.js";
import { useMaterialContentUrl } from "./use-material-content-url.js";

export interface SceneMediaHandle {
  /** Starts the audible track synchronously inside the user's gesture. */
  readonly playAudibleFromGesture: (localTimeSeconds: number) => void;
}

export interface SceneMediaProps {
  readonly storyId: string;
  readonly session: AuthSession;
  readonly slot: ScenePlaybackSlot;
  readonly localTimeSeconds: number;
  readonly playing: boolean;
  readonly active: boolean;
  readonly muted: boolean;
  readonly preload: "auto" | "metadata";
  readonly retryKey: number;
  readonly controlsCopy?: EditorCopy | undefined;
  readonly onTogglePlayback?: (() => void) | undefined;
  readonly onResourceState: (event: SceneResourceEvent) => void;
  readonly onUnexpectedPause: () => void;
}

/** The only active image/video dispatcher used by every scene preview. */
export const SceneMedia = forwardRef<SceneMediaHandle, SceneMediaProps>(function SceneMedia(props, ref) {
  const content = useMaterialContentUrl({
    storyId: props.storyId, material: props.slot.material, session: props.session,
    lifecycle: "owned", retryKey: props.retryKey,
  });
  const visualResourceId = `${props.slot.id}:visual`;
  useEffect(() => {
    if (content.failed) props.onResourceState({ resourceId: visualResourceId, state: "failed" });
  }, [content.failed, props.onResourceState, visualResourceId]);
  if (!content.url) return <span className={classNames(mediaStyles.placeholder, mediaStyles.preview)} aria-hidden="true">
    {props.slot.material.kind === "video" ? "▶" : "◫"}
  </span>;
  return props.slot.material.kind === "video"
    ? <SceneVideo {...props} ref={ref} material={props.slot.material} url={content.url} />
    : <img className={mediaStyles.media} src={content.url} alt="" draggable={false}
      onLoad={() => props.onResourceState({ resourceId: visualResourceId, state: "ready" })}
      onError={() => props.onResourceState({ resourceId: visualResourceId, state: "failed" })} />;
});
