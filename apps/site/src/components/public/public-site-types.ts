import type { Locale } from "@storyteller/localization";

export type PublicPageKey = "home" | "travel" | "personal" | "features";

export interface PublicSiteCard {
  readonly title: string;
  readonly body: string;
}

export interface PublicSiteSection {
  readonly eyebrow: string;
  readonly title: string;
  readonly intro: string;
  readonly items: readonly PublicSiteCard[];
}

export interface PublicSitePageData {
  readonly key: PublicPageKey;
  readonly path: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly hero: {
    readonly eyebrow: string;
    readonly title: string;
    readonly accent: string;
    readonly description: string;
  };
  readonly proofPoints: readonly string[];
  readonly sections: readonly PublicSiteSection[];
  readonly related: readonly PublicPageKey[];
  readonly showRoadmap?: boolean;
}

export interface PublicSiteLocaleData {
  readonly code: string;
  readonly hrefLang: string;
  readonly ogLocale: string;
  readonly languageName: string;
  readonly skipToContent: string;
  readonly primaryNavigation: string;
  readonly languageNavigation: string;
  readonly brandTagline: string;
  readonly nav: Readonly<Record<PublicPageKey, string>>;
  readonly openStudio: string;
  readonly earlyAccess: string;
  readonly secondaryCta: string;
  readonly illustrativeExample: string;
  readonly finalTitle: string;
  readonly finalBody: string;
  readonly footer: string;
  readonly roadmap: string;
  readonly roadmapIntro: string;
  readonly current: string;
  readonly overall: string;
  readonly planned: string;
  readonly complete: string;
  readonly allComplete: string;
  readonly tasks: string;
  readonly scopePending: string;
  readonly roadmapLoading: string;
  readonly roadmapUnavailable: string;
  readonly progressNote: string;
  readonly updated: string;
  readonly pages: readonly PublicSitePageData[];
}

export interface PublicSiteData {
  readonly brand: string;
  readonly origin: string;
  readonly defaultLocale: Locale;
  readonly locales: Readonly<Record<Locale, PublicSiteLocaleData>>;
}

export interface ResolvedPublicPage {
  readonly locale: Locale;
  readonly localeData: PublicSiteLocaleData;
  readonly page: PublicSitePageData;
}
