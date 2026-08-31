import { useQuery } from "@tanstack/react-query";
import type { Locale } from "@storyteller/localization";
import { getPublicSiteCopy } from "../public/public-site-copy.js";
import { RoadmapMilestone } from "./RoadmapMilestone.js";
import type { PublicRoadmap } from "./roadmap-types.js";
import styles from "./ProductRoadmap.module.css";

interface ProductRoadmapProps { readonly locale: Locale }

export function ProductRoadmap({ locale }: ProductRoadmapProps) {
  const copy = getPublicSiteCopy(locale);
  const query = useQuery({
    queryKey: ["public-product-roadmap"],
    queryFn: loadPublicRoadmap,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const publicRoadmap = query.data;

  if (!publicRoadmap) {
    return (
      <section className={styles.roadmap} aria-labelledby="roadmap-title" aria-busy={query.isPending}>
        <div className={styles.heading}>
          <div>
            <h2 id="roadmap-title">{copy.roadmap}</h2>
            <p className={styles.intro}>{copy.roadmapIntro}</p>
          </div>
        </div>
        <p className={styles.status} role="status">{query.isPending ? copy.roadmapLoading : copy.roadmapUnavailable}</p>
      </section>
    );
  }
  const current = publicRoadmap.milestones.find((milestone) => milestone.number === publicRoadmap.currentMilestoneNumber);

  return (
    <section className={styles.roadmap} aria-labelledby="roadmap-title" data-roadmap-revision={publicRoadmap.sourceRevision}>
      <div className={styles.heading}>
        <div>
          <h2 id="roadmap-title">{copy.roadmap}</h2>
          <p className={styles.intro}>{copy.roadmapIntro}</p>
        </div>
        <p className={styles.position} data-complete={!current}>
          {current ? <>{copy.current} <strong>{current.title[locale]}</strong> <span>{current.percent}%</span></> : copy.allComplete}
          <span>{copy.overall} <strong>{publicRoadmap.overallProgress.percent}%</strong></span>
        </p>
      </div>
      <ol className={styles.milestones}>
        {publicRoadmap.milestones.map((milestone) => <RoadmapMilestone key={milestone.number} milestone={milestone} locale={locale} copy={copy} />)}
      </ol>
      <p className={styles.note}>{copy.progressNote}<br />{copy.updated}</p>
    </section>
  );
}

async function loadPublicRoadmap(): Promise<PublicRoadmap> {
  const response = await fetch("/product-roadmap.json", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Product roadmap request failed with ${response.status}`);
  const roadmap: unknown = await response.json();
  if (!roadmap || typeof roadmap !== "object" || !Array.isArray((roadmap as PublicRoadmap).milestones)) {
    throw new Error("Invalid product roadmap response");
  }
  return roadmap as PublicRoadmap;
}
