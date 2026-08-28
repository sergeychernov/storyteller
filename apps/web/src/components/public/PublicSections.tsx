import { Link } from "react-router-dom";
import { getPageByKey } from "./public-site-model.js";
import type { ResolvedPublicPage } from "./public-site-types.js";
import styles from "./PublicSections.module.css";

interface PublicSectionsProps {
  readonly resolvedPage: ResolvedPublicPage;
}

export function PublicSections({ resolvedPage }: PublicSectionsProps) {
  const { locale, localeData, page } = resolvedPage;

  return (
    <>
      {page.sections.map((section, sectionIndex) => (
        <section className={styles.section} key={section.title} data-tone={sectionIndex % 2 === 1 ? "soft" : "plain"}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>{section.eyebrow}</p>
            <h2>{section.title}</h2>
            <p className={styles.intro}>{section.intro}</p>
            {(page.key === "travel" || page.key === "personal") && sectionIndex === 1 && <p className={styles.disclosure}>{localeData.illustrativeExample}</p>}
          </div>
          <div className={styles.cards} data-count={section.items.length}>
            {section.items.map((item, itemIndex) => (
              <article className={styles.card} key={item.title}>
                <span aria-hidden="true">{String(itemIndex + 1).padStart(2, "0")}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <nav className={styles.related} aria-label={localeData.secondaryCta}>
        {page.related.map((key) => {
          const relatedPage = getPageByKey(locale, key);
          return <Link key={key} to={relatedPage.path}><span>{localeData.nav[key]}</span><span aria-hidden="true">↗</span></Link>;
        })}
      </nav>
    </>
  );
}
