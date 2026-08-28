import { Link } from "react-router-dom";
import { useLocalization } from "../../localization.js";
import { getPublicSiteCopy } from "./public-site-copy.js";
import styles from "./PublicIntro.module.css";

interface PublicIntroProps { readonly studioPath: string }

export function PublicIntro({ studioPath }: PublicIntroProps) {
  const { locale } = useLocalization();
  const copy = getPublicSiteCopy(locale);

  return (
    <section className={styles.intro} aria-labelledby="public-title">
      <p className={styles.eyebrow}>{copy.eyebrow}</p>
      <h1 id="public-title">{copy.title}<br /><em>{copy.accent}</em></h1>
      <p className={styles.description}>{copy.description}</p>
      <Link className={styles.action} to={studioPath}>{copy.enterStudio} <span aria-hidden="true">↗</span></Link>
      <p className={styles.note}>{copy.earlyAccess}</p>
    </section>
  );
}
