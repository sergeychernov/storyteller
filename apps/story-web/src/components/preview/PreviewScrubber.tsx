import type { StoryTimeline } from "../../api.js";
import styles from "./StoryPreview.module.css";

interface PreviewScrubberProps {
  readonly timeline: StoryTimeline;
  readonly value: number;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (value: number) => void;
}

export function PreviewScrubber({ timeline, value, disabled, label, onChange }: PreviewScrubberProps) {
  const boundaries = sceneBoundaries(timeline);
  const progress = timeline.totalDurationSeconds <= 0 ? 0
    : Math.min(100, Math.max(0, value / timeline.totalDurationSeconds * 100));
  return <div className={styles.scrubberContainer}>
    <div className={styles.scrubberTicks} data-preview-scrubber-rail aria-hidden="true">
      <span className={styles.scrubberProgress} data-preview-scrubber-progress style={{ width: `${progress}%` }} />
      {boundaries.map((boundary) => <span
        className={styles.scrubberTick}
        data-preview-scene-boundary={boundary.seconds}
        key={boundary.seconds}
        style={{ left: `${boundary.percent}%` }}
      />)}
    </div>
    <input
      className={styles.scrubber}
      type="range"
      min="0"
      max={timeline.totalDurationSeconds || 0}
      step="any"
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
  </div>;
}

function sceneBoundaries(timeline: StoryTimeline): readonly { readonly seconds: number; readonly percent: number }[] {
  if (timeline.totalDurationSeconds <= 0) return [];
  const seen = new Set<number>();
  const boundaries: { seconds: number; percent: number }[] = [];
  for (const scene of timeline.scenes.slice(1)) {
    const seconds = scene.startSeconds;
    if (seconds <= 0 || seconds >= timeline.totalDurationSeconds || seen.has(seconds)) continue;
    seen.add(seconds);
    boundaries.push({ seconds, percent: seconds / timeline.totalDurationSeconds * 100 });
  }
  return boundaries;
}
