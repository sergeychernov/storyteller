import { analytics } from "@storyteller/analytics";
import { useCallback, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { AuthSession, Story, StoryTimeline } from "../../api.js";
import { getEditorCopy } from "../editor/editor-copy.js";
import { storyEditorPath } from "../editor/scene-deletion-model.js";
import { useMediaQuery } from "../editor/use-media-query.js";
import { getPreviewCopy, interpolatePreviewCopy } from "./preview-copy.js";
import { PreviewScrubber } from "./PreviewScrubber.js";
import { formatPreviewClock, positionAtPlayhead } from "./story-preview-model.js";
import { StoryPreviewStage, type StoryPreviewStageHandle } from "./StoryPreviewStage.js";
import { useStoryPreviewController } from "./use-story-preview-controller.js";
import { StoryExportPanel } from "./StoryExportPanel.js";
import { useLocalization } from "@storyteller/web-ui";
import styles from "./StoryPreview.module.css";

interface StoryPreviewProps {
  readonly story: Story;
  readonly timeline: StoryTimeline;
  readonly session: AuthSession;
}

export function StoryPreview({ story, timeline, session }: StoryPreviewProps) {
  const { locale } = useLocalization();
  const location = useLocation();
  const previewCopy = getPreviewCopy(locale);
  const editorCopy = getEditorCopy(locale);
  const desktop = useMediaQuery("(min-width: 768px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [muted, setMuted] = useState(true);
  const stage = useRef<StoryPreviewStageHandle>(null);
  const trackCompleted = useCallback(() => {
    analytics.track("story preview completed", { web_layout: desktop ? "desktop" : "mobile_web" });
  }, [desktop]);
  const controller = useStoryPreviewController({ timeline, onCompleted: trackCompleted });
  const position = positionAtPlayhead(timeline, controller.snapshot.playheadSeconds);
  const pendingScene = controller.snapshot.pendingTimelineIndex === undefined
    ? undefined : timeline.scenes[controller.snapshot.pendingTimelineIndex];
  const returnTo = resolveReturnPath(location.state, story);
  const containsAudio = story.scenes.some((scene) => scene.materials.some((material) => material.kind === "video" && material.hasAudio));
  const playing = controller.snapshot.status === "playing" || controller.snapshot.status === "buffering";

  const play = () => {
    if (!muted) stage.current?.playAudibleFromGesture();
    controller.play();
  };
  const toggleSound = () => {
    const enabling = muted;
    setMuted(!muted);
    if (!enabling || controller.snapshot.status !== "playing") return;
    stage.current?.playAudibleFromGesture();
  };

  return <section className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.back} to={returnTo}>← {previewCopy.back}</Link>
      <div className={styles.storyTitle}>{story.title || editorCopy.untitledStory}</div>
      <div className={styles.sceneCounter} aria-live="polite">
        {position ? `${previewCopy.scene} ${position.scene.index + 1} / ${timeline.scenes.length}` : previewCopy.scene}
      </div>
    </header>

    <main className={styles.main}>
      <div className={styles.canvasArea}>
        <span className={styles.canvasBadge}>{previewCopy.canvas} · 9:16</span>
        <StoryPreviewStage
          ref={stage}
          story={story}
          timeline={timeline}
          session={session}
          snapshot={controller.snapshot}
          muted={muted}
          reducedMotion={reducedMotion}
          copy={editorCopy}
          onReady={controller.onSceneReady}
          onWaiting={controller.onSceneWaiting}
          onFailed={controller.onSceneFailed}
          onUnexpectedPause={controller.onUnexpectedPause}
        />
      </div>

      <section className={styles.transport} aria-label={previewCopy.totalDuration}>
        <div className={styles.buttons}>
          <button type="button" className={`${styles.primaryButton} ${styles.transportToggle}`} disabled={!position}
            aria-label={playing ? previewCopy.pause : previewCopy.play}
            onClick={playing ? controller.pause : play}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={playing ? "M6 5h4v14H6zm8 0h4v14h-4z" : "M7 4.5v15l12-7.5z"} />
            </svg>
          </button>
          <span className={styles.clock}>{formatPreviewClock(controller.snapshot.playheadSeconds)}</span>
          <PreviewScrubber
            timeline={timeline}
            value={controller.snapshot.playheadSeconds}
            disabled={!position}
            label={previewCopy.totalDuration}
            onChange={controller.seek}
          />
          <span className={styles.clock}>{formatPreviewClock(timeline.totalDurationSeconds)}</span>
          <button type="button" className={styles.iconButton} aria-pressed={!muted} disabled={!containsAudio}
            aria-label={muted ? previewCopy.soundOn : previewCopy.soundOff}
            onClick={toggleSound}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 9h4l6-5v16l-6-5H3z" />
              <path d={muted ? "m17 9 5 6m0-6-5 6" : "M17 7q7 5 0 10"} className={styles.soundMark} />
            </svg>
          </button>
        </div>
        <div className={styles.status} role={controller.snapshot.status === "failed" ? "alert" : "status"} aria-live="polite">
          {position ? statusText(controller.snapshot.status, previewCopy, pendingScene?.index) : previewCopy.noPlayableScenes}
          {controller.snapshot.status === "failed" && <button type="button" onClick={controller.retry}>{previewCopy.retry}</button>}
        </div>
        {controller.snapshot.revisionReset && <p className={styles.revisionNotice}>{previewCopy.changed}</p>}
      </section>

      <TimelineFacts timeline={timeline} previewCopy={previewCopy} editorCopy={editorCopy} />
      <StoryExportPanel story={story} session={session} />
    </main>
  </section>;
}

function TimelineFacts({ timeline, previewCopy, editorCopy }: {
  readonly timeline: StoryTimeline;
  readonly previewCopy: ReturnType<typeof getPreviewCopy>;
  readonly editorCopy: ReturnType<typeof getEditorCopy>;
}) {
  const exceeded = timeline.formatLimits.filter(({ status }) => status === "exceeded");
  if (!timeline.warnings.length && !exceeded.length) return null;
  return <aside className={styles.facts}>
    <strong>{previewCopy.totalDuration}: {formatPreviewClock(timeline.totalDurationSeconds)}</strong>
    <ul>
      {timeline.warnings.length > 0 && <li>{interpolatePreviewCopy(previewCopy.emptyScenes, { count: timeline.warnings.length })}</li>}
      {exceeded.map((limit) => <li key={limit.formatId}>{interpolatePreviewCopy(previewCopy.limitExceeded, {
        format: formatLimitLabel(limit.formatId, editorCopy), duration: formatPreviewClock(limit.excessSeconds),
      })}</li>)}
    </ul>
  </aside>;
}

function statusText(status: ReturnType<typeof useStoryPreviewController>["snapshot"]["status"], copy: ReturnType<typeof getPreviewCopy>, pendingIndex?: number): string {
  if (status === "buffering") return pendingIndex === undefined ? copy.buffering
    : interpolatePreviewCopy(copy.loadingScene, { number: pendingIndex + 1 });
  if (status === "playing") return "";
  if (status === "paused") return copy.paused;
  if (status === "failed") return copy.failed;
  if (status === "completed") return copy.completed;
  return copy.ready;
}

function resolveReturnPath(state: unknown, story: Story): string {
  const candidate = typeof state === "object" && state !== null && "returnTo" in state
    ? (state as { readonly returnTo?: unknown }).returnTo : undefined;
  if (typeof candidate === "string" && (candidate === `/${story.id}` || candidate.startsWith(`/${story.id}/scenes/`))) return candidate;
  return storyEditorPath(story.id, story.scenes[0]?.id ?? "");
}

function formatLimitLabel(formatId: string, copy: ReturnType<typeof getEditorCopy>): string {
  if (formatId === "youtube-shorts") return copy.timelineFormatShorts;
  if (formatId === "youtube-video") return copy.timelineFormatVideo;
  if (formatId === "youtube-video-verified") return copy.timelineFormatVerifiedVideo;
  return formatId;
}
