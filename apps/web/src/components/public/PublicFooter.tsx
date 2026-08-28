import { Link } from "react-router-dom";
import { getPageByKey, publicSite } from "./public-site-model.js";
import type { ResolvedPublicPage } from "./public-site-types.js";
import styles from "./PublicFooter.module.css";

interface PublicFooterProps {
  readonly resolvedPage: ResolvedPublicPage;
  readonly studioPath: string;
}

export function PublicFooter({ resolvedPage, studioPath }: PublicFooterProps) {
  const { locale, localeData } = resolvedPage;
  const homePath = getPageByKey(locale, "home").path;

  return (
    <>
      <section className={styles.cta} aria-labelledby="final-cta-title">
        <div>
          <p>{localeData.brandTagline}</p>
          <h2 id="final-cta-title">{localeData.finalTitle}</h2>
          <p className={styles.description}>{localeData.finalBody}</p>
        </div>
        <Link className={styles.action} to={studioPath}>{localeData.openStudio}<span aria-hidden="true">↗</span></Link>
      </section>
      <footer className={styles.footer}>
        <Link className={styles.brand} to={homePath}>{publicSite.brand}</Link>
        <p>{localeData.footer}</p>
        <p>© {new Date().getFullYear()}</p>
      </footer>
    </>
  );
}
