import { useEffect } from "react";
import { getLocalizedVersions, publicSite } from "./public-site-model.js";
import type { ResolvedPublicPage } from "./public-site-types.js";

interface PublicSeoProps {
  readonly resolvedPage: ResolvedPublicPage;
}

function addMeta(attributes: Record<string, string>) {
  const element = document.createElement("meta");
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.dataset.publicSeo = "";
  document.head.append(element);
}

function addLink(attributes: Record<string, string>) {
  const element = document.createElement("link");
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  element.dataset.publicSeo = "";
  document.head.append(element);
}

export function PublicSeo({ resolvedPage }: PublicSeoProps) {
  const { locale, localeData, page } = resolvedPage;

  useEffect(() => {
    document.head.querySelectorAll("[data-public-seo]").forEach((element) => element.remove());
    document.title = page.seoTitle;
    document.documentElement.lang = locale;

    addMeta({ name: "description", content: page.seoDescription });
    addMeta({ name: "robots", content: "index, follow, max-image-preview:large" });
    addMeta({ property: "og:type", content: "website" });
    addMeta({ property: "og:site_name", content: publicSite.brand });
    addMeta({ property: "og:title", content: page.seoTitle });
    addMeta({ property: "og:description", content: page.seoDescription });
    addMeta({ property: "og:url", content: `${publicSite.origin}${page.path}` });
    addMeta({ property: "og:locale", content: localeData.ogLocale });
    addMeta({ name: "twitter:card", content: "summary" });
    addMeta({ name: "twitter:title", content: page.seoTitle });
    addMeta({ name: "twitter:description", content: page.seoDescription });
    addLink({ rel: "canonical", href: `${publicSite.origin}${page.path}` });

    const versions = getLocalizedVersions(page.key);
    for (const version of versions) {
      addLink({ rel: "alternate", hreflang: version.localeData.hrefLang, href: `${publicSite.origin}${version.page.path}` });
    }
    const defaultVersion = versions.find((version) => version.locale === publicSite.defaultLocale);
    if (defaultVersion) addLink({ rel: "alternate", hreflang: "x-default", href: `${publicSite.origin}${defaultVersion.page.path}` });

    const structuredData = document.createElement("script");
    structuredData.type = "application/ld+json";
    structuredData.dataset.publicSeo = "";
    structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.seoTitle,
      description: page.seoDescription,
      url: `${publicSite.origin}${page.path}`,
      inLanguage: localeData.hrefLang,
      isPartOf: { "@type": "WebSite", name: publicSite.brand, url: publicSite.origin },
    });
    document.head.append(structuredData);

    return () => {
      document.head.querySelectorAll("[data-public-seo]").forEach((element) => element.remove());
      document.title = publicSite.brand;
      document.documentElement.lang = "en";
      addMeta({ name: "robots", content: "noindex, nofollow" });
    };
  }, [locale, localeData.hrefLang, localeData.ogLocale, page]);

  return null;
}
