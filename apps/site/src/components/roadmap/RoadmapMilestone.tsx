import type { Locale } from "@storyteller/localization";
import type { PublicSiteCopy } from "../public/public-site-copy.js";
import type { PublicMilestone } from "./roadmap-types.js";
import styles from "./RoadmapMilestone.module.css";

interface RoadmapMilestoneProps {
  readonly milestone: PublicMilestone;
  readonly locale: Locale;
  readonly copy: PublicSiteCopy;
}

export function RoadmapMilestone({ milestone, locale, copy }: RoadmapMilestoneProps) {
  const label = milestone.state === "current" ? copy.current : milestone.state === "complete" ? copy.complete : copy.planned;
  const title = milestone.title[locale];

  return (
    <li className={styles.milestone} data-state={milestone.state} aria-current={milestone.state === "current" ? "step" : undefined}>
      <div className={styles.topline}>
        <span className={styles.state}>{milestone.state === "complete" && <span aria-hidden="true">✓ </span>}{label}</span>
      </div>
      <h3 className={styles.title}>{title}</h3>
      {milestone.estimatedCompletion && (
        <p className={styles.estimate}>
          <time dateTime={milestone.estimatedCompletion.month}>{milestone.estimatedCompletion.label[locale]}</time>
        </p>
      )}
      <progress className={styles.progress} max={milestone.total || 1} value={milestone.completed} aria-label={title} />
      <p className={styles.count}>{milestone.total > 0 ? `${milestone.completed} / ${milestone.total} ${copy.tasks}` : copy.scopePending}</p>
    </li>
  );
}
