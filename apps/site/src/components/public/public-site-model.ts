import type { Locale } from "@storyteller/localization";
import publicSite from "virtual:public-site";
import type { PublicPageKey, ResolvedPublicPage } from "./public-site-types.js";

const locales = Object.entries(publicSite.locales) as [Locale, (typeof publicSite.locales)[Locale]][];

export const publicPages: readonly ResolvedPublicPage[] = locales.flatMap(([locale, localeData]) =>
  localeData.pages.map((page) => ({ locale, localeData, page })),
);

export function normalizePublicPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function findPublicPage(pathname: string): ResolvedPublicPage | undefined {
  const normalized = normalizePublicPath(pathname);
  return publicPages.find(({ page }) => page.path === normalized);
}

export function isPublicSitePath(pathname: string): boolean {
  const normalized = normalizePublicPath(pathname);
  return publicPages.some(({ page }) => page.path === normalized)
    || locales.some(([, localeData]) => pathname === `/${localeData.code}` || pathname.startsWith(`/${localeData.code}/`));
}

export function getPageByKey(locale: Locale, key: PublicPageKey) {
  const page = publicSite.locales[locale].pages.find((candidate) => candidate.key === key);
  if (!page) throw new Error(`Missing public page ${locale}/${key}`);
  return page;
}

export function getLocalizedVersions(key: PublicPageKey): readonly ResolvedPublicPage[] {
  return locales.map(([locale, localeData]) => {
    const page = localeData.pages.find((candidate) => candidate.key === key);
    if (!page) throw new Error(`Missing public page ${locale}/${key}`);
    return { locale, localeData, page };
  });
}

export { publicSite };
