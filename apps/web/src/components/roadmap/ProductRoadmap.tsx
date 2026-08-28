import publicRoadmap from "virtual:product-roadmap";
import { useLocalization } from "../../localization.js";
import { getPublicSiteCopy } from "../public/public-site-copy.js";
import { RoadmapMilestone } from "./RoadmapMilestone.js";
import styles from "./ProductRoadmap.module.css";

export function ProductRoadmap() {
  const { locale } = useLocalization();
  const copy = getPublicSiteCopy(locale);
  const current = publicRoadmap.milestones.find((milestone) => milestone.id === publicRoadmap.currentMilestoneId);

  return (
    <section className={styles.roadmap} aria-labelledby="roadmap-title" data-roadmap-revision={publicRoadmap.sourceRevision}>
      <div className={styles.heading}>
        <div>
          <h2 id="roadmap-title">{copy.roadmap}</h2>
          <p className={styles.intro}>{copy.roadmapIntro}</p>
        </div>
        <p className={styles.position} data-complete={!current}>
          {current ? <>{copy.current} <strong>{current.id}</strong> <span>{current.percent}%</span></> : copy.allComplete}
        </p>
      </div>
      <ol className={styles.milestones}>
        {publicRoadmap.milestones.map((milestone) => <RoadmapMilestone key={milestone.id} milestone={milestone} locale={locale} copy={copy} />)}
      </ol>
      <p className={styles.note}>{copy.progressNote}<br />{copy.updated}</p>
    </section>
  );
}
