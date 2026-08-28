import { PublicHeader } from "../components/public/PublicHeader.js";
import { PublicIntro } from "../components/public/PublicIntro.js";
import { ProductRoadmap } from "../components/roadmap/ProductRoadmap.js";
import styles from "./PublicPage.module.css";

interface PublicPageProps { readonly studioPath: string }

export function PublicPage({ studioPath }: PublicPageProps) {
  return (
    <div className={styles.page}>
      <PublicHeader />
      <main className={styles.content}>
        <PublicIntro studioPath={studioPath} />
        <ProductRoadmap />
      </main>
    </div>
  );
}
