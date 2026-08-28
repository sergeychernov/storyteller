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
        <span className={styles.id}>{milestone.id}</span>
        <span className={styles.state}>{milestone.state === "complete" && <span aria-hidden="true">✓ </span>}{label}</span>
      </div>
      <h3 className={styles.title}>{title}</h3>
      <progress className={styles.progress} max={milestone.total || 1} value={milestone.completed} aria-label={`${milestone.id} · ${title}`} />
      <p className={styles.count}>{milestone.total > 0 ? `${milestone.completed} / ${milestone.total} ${copy.tasks}` : copy.scopePending}</p>
    </li>
  );
}
