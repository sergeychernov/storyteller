import { PublicFooter } from "../components/public/PublicFooter.js";
import { PublicHeader } from "../components/public/PublicHeader.js";
import { PublicIntro } from "../components/public/PublicIntro.js";
import { PublicSections } from "../components/public/PublicSections.js";
import { PublicSeo } from "../components/public/PublicSeo.js";
import type { ResolvedPublicPage } from "../components/public/public-site-types.js";
import { ProductRoadmap } from "../components/roadmap/ProductRoadmap.js";
import { useLocalization } from "../localization.js";
import styles from "./PublicPage.module.css";

interface PublicPageProps {
  readonly resolvedPage: ResolvedPublicPage;
  readonly studioPath: string;
}

export function PublicPage({ resolvedPage, studioPath }: PublicPageProps) {
  const { locale, setLocale } = useLocalization();

  useEffect(() => {
    if (locale !== resolvedPage.locale) setLocale(resolvedPage.locale);
  }, [locale, resolvedPage.locale, setLocale]);

  return (
    <div className={styles.page}>
      <PublicSeo resolvedPage={resolvedPage} />
      <a className={styles.skipLink} href="#public-content">{resolvedPage.localeData.skipToContent}</a>
      <PublicHeader resolvedPage={resolvedPage} studioPath={studioPath} />
      <main className={styles.content} id="public-content">
        <PublicIntro resolvedPage={resolvedPage} studioPath={studioPath} />
        <PublicSections resolvedPage={resolvedPage} />
        {resolvedPage.page.showRoadmap && <ProductRoadmap locale={resolvedPage.locale} />}
        <PublicFooter resolvedPage={resolvedPage} studioPath={studioPath} />
      </main>
    </div>
  );
}
import { useEffect } from "react";
