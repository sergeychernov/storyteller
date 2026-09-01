import type { StoryTimeline } from "../../api.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./TimelineSummary.module.css";
import { formatTimelineDuration, getTimelineProblems } from "./timeline-summary-model.js";

interface TimelineSummaryProps {
  readonly timeline: StoryTimeline | undefined;
  readonly loading: boolean;
  readonly error: boolean;
  readonly copy: EditorCopy;
  readonly onRetry: () => void;
}

export function TimelineSummary({ timeline, loading, error, copy, onRetry }: TimelineSummaryProps) {
  if (loading) return <section className={styles.summary} aria-live="polite" aria-busy="true">{copy.timelineCalculating}</section>;
  if (error || !timeline) return <section className={styles.summary} role="alert">
    <span>{copy.timelineLoadError}</span>
    <button type="button" onClick={onRetry}>{copy.retryTimeline}</button>
  </section>;

  const problems = getTimelineProblems(timeline);
  return <section className={styles.summary} aria-label={copy.timelineSummary}>
    <div className={styles.head}>
      <span>{copy.timelineDurationLabel}</span>
      <strong>{formatTimelineDuration(timeline.totalDurationSeconds)}</strong>
      <span className={problems.count > 0 ? styles.problemCount : styles.problemCountClear}>
        {copy.timelineProblems.replace("{{count}}", String(problems.count))}
      </span>
    </div>
    {problems.count > 0 && <ul className={styles.problems}>
      {problems.emptySceneIds.length > 0 && <li>
        <span className={styles.marker} aria-hidden="true">!</span>
        {copy.timelineEmptyScenes.replace("{{count}}", String(problems.emptySceneIds.length))}
      </li>}
      {problems.exceededLimits.map((limit) => <li key={limit.formatId}>
        <span className={styles.marker} aria-hidden="true">!</span>
        {copy.timelineFormatExceeded
          .replace("{{format}}", formatLabel(copy, limit.formatId))
          .replace("{{duration}}", formatTimelineDuration(limit.excessSeconds))}
      </li>)}
    </ul>}
  </section>;
}

function formatLabel(copy: EditorCopy, formatId: string): string {
  if (formatId === "youtube-shorts") return copy.timelineFormatShorts;
  if (formatId === "youtube-video") return copy.timelineFormatVideo;
  if (formatId === "youtube-video-verified") return copy.timelineFormatVerifiedVideo;
  return formatId;
}
