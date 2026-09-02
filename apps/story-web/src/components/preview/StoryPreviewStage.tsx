import { forwardRef, useImperativeHandle, useRef } from "react";
import type { AuthSession, Story, StoryTimeline } from "../../api.js";
import type { EditorCopy } from "../editor/editor-copy.js";
import type { ScenePlayerHandle } from "../editor/ScenePlayer.js";
import { nextPlayableTimelineIndex } from "./story-preview-model.js";
import { StoryPreviewScene } from "./StoryPreviewScene.js";
import type { StoryPreviewSnapshot } from "./use-story-preview-controller.js";
import styles from "./StoryPreview.module.css";

interface StoryPreviewStageProps {
  readonly story: Story;
  readonly timeline: StoryTimeline;
  readonly session: AuthSession;
  readonly snapshot: StoryPreviewSnapshot;
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  readonly copy: EditorCopy;
  readonly onReady: (timelineIndex: number) => void;
  readonly onWaiting: (timelineIndex: number) => void;
  readonly onFailed: (timelineIndex: number) => void;
  readonly onUnexpectedPause: (timelineIndex: number) => void;
}

export interface StoryPreviewStageHandle {
  readonly playAudibleFromGesture: () => void;
}

export const StoryPreviewStage = forwardRef<StoryPreviewStageHandle, StoryPreviewStageProps>(function StoryPreviewStage(props, ref) {
  const players = useRef(new Map<number, ScenePlayerHandle>());
  const currentIndex = props.snapshot.currentTimelineIndex;
  useImperativeHandle(ref, () => ({
    playAudibleFromGesture() {
      if (currentIndex !== undefined) players.current.get(currentIndex)?.playAudibleFromGesture();
    },
  }), [currentIndex]);
  if (currentIndex === undefined) return <div className={styles.emptyCanvas} />;
  const nextIndex = nextPlayableTimelineIndex(props.timeline, currentIndex);
  const indexes = nextIndex === undefined ? [currentIndex] : [currentIndex, nextIndex];
  return <div className={styles.stage} data-preview-shell-count={indexes.length}>
    {indexes.map((timelineIndex) => {
      const timelineScene = props.timeline.scenes[timelineIndex]!;
      const scene = props.story.scenes.find(({ id }) => id === timelineScene.sceneId);
      if (!scene) return null;
      const active = timelineIndex === currentIndex;
      const previousScene = props.story.scenes[timelineScene.index - 1];
      return <div className={active ? styles.currentShell : styles.nextShell} data-preview-shell={active ? "current" : "next"}
        key={`${props.snapshot.retryKey}:${timelineIndex}`}>
        <StoryPreviewScene
          ref={(handle) => {
            if (handle) players.current.set(timelineIndex, handle);
            else players.current.delete(timelineIndex);
          }}
          storyId={props.story.id}
          session={props.session}
          scene={scene}
          previousScene={previousScene}
          timelineIndex={timelineIndex}
          localTimeSeconds={active ? Math.min(timelineScene.durationSeconds,
            Math.max(0, props.snapshot.playheadSeconds - timelineScene.startSeconds)) : 0}
          status={props.snapshot.status}
          active={active}
          pending={props.snapshot.pendingTimelineIndex === timelineIndex}
          muted={props.muted}
          reducedMotion={props.reducedMotion}
          retryKey={props.snapshot.retryKey}
          copy={props.copy}
          onReady={props.onReady}
          onWaiting={props.onWaiting}
          onFailed={props.onFailed}
          onUnexpectedPause={props.onUnexpectedPause}
        />
      </div>;
    })}
  </div>;
});
