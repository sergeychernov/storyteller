import { Link } from "react-router-dom";
import { getPageByKey } from "./public-site-model.js";
import type { ResolvedPublicPage } from "./public-site-types.js";
import styles from "./PublicIntro.module.css";

interface PublicIntroProps {
  readonly resolvedPage: ResolvedPublicPage;
  readonly studioPath: string;
}

export function PublicIntro({ resolvedPage, studioPath }: PublicIntroProps) {
  const { locale, localeData, page } = resolvedPage;
  const featuresPath = getPageByKey(locale, "features").path;

  return (
    <section className={styles.intro} aria-labelledby="public-title">
      <div className={styles.hero}>
        <p className={styles.eyebrow}>{page.hero.eyebrow}</p>
        <h1 id="public-title">{page.hero.title}<br /><em>{page.hero.accent}</em></h1>
        <p className={styles.description}>{page.hero.description}</p>
        <div className={styles.actions}>
          <Link className={styles.action} to={studioPath}>{localeData.openStudio}<span aria-hidden="true">↗</span></Link>
          {page.key !== "features" && <Link className={styles.secondary} to={featuresPath}>{localeData.secondaryCta}</Link>}
        </div>
        <p className={styles.note}>{localeData.earlyAccess}</p>
      </div>
      <ul className={styles.proofPoints}>
        {page.proofPoints.map((point, index) => <li key={point}><span aria-hidden="true">0{index + 1}</span>{point}</li>)}
      </ul>
    </section>
  );
}
