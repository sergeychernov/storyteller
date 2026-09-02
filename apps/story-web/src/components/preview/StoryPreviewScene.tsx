import { forwardRef } from "react";
import type { AuthSession, Scene } from "../../api.js";
import { ScenePlayer, type ScenePlayerHandle } from "../editor/ScenePlayer.js";
import type { EditorCopy } from "../editor/editor-copy.js";
import { prefersMetadataFirstPreload } from "../editor/use-material-content-url.js";
import type { StoryPreviewStatus } from "./use-story-preview-controller.js";
import styles from "./StoryPreview.module.css";

interface StoryPreviewSceneProps {
  readonly storyId: string;
  readonly session: AuthSession;
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly timelineIndex: number;
  readonly localTimeSeconds: number;
  readonly status: StoryPreviewStatus;
  readonly active: boolean;
  readonly pending: boolean;
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  readonly retryKey: number;
  readonly copy: EditorCopy;
  readonly onReady: (timelineIndex: number) => void;
  readonly onWaiting: (timelineIndex: number) => void;
  readonly onFailed: (timelineIndex: number) => void;
  readonly onUnexpectedPause: (timelineIndex: number) => void;
}

/** Story-specific clock/status adapter around the shared scene executor. */
export const StoryPreviewScene = forwardRef<ScenePlayerHandle, StoryPreviewSceneProps>(function StoryPreviewScene(props, ref) {
  const preload = props.active || props.pending || !prefersMetadataFirstPreload() ? "auto" : "metadata";
  return <div className={styles.canvas} data-preview-scene={props.scene.id}>
    <ScenePlayer
      ref={ref}
      scene={props.scene}
      previousScene={props.previousScene}
      copy={props.copy}
      storyId={props.storyId}
      session={props.session}
      localTimeSeconds={props.localTimeSeconds}
      playing={props.status === "playing"}
      active={props.active}
      muted={props.muted}
      reducedMotion={props.reducedMotion}
      preload={preload}
      retryKey={props.retryKey}
      onReady={() => props.onReady(props.timelineIndex)}
      onWaiting={() => props.onWaiting(props.timelineIndex)}
      onFailed={() => props.onFailed(props.timelineIndex)}
      onUnexpectedPause={() => props.onUnexpectedPause(props.timelineIndex)}
    />
  </div>;
});
