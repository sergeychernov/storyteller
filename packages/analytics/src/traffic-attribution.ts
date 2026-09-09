export type TrafficChannel =
  | "direct"
  | "organic_search"
  | "paid_search"
  | "campaign"
  | "social"
  | "referral"
  | "internal"
  | "unknown";

export type SearchEngine = "google" | "yandex" | "bing" | "duckduckgo" | "yahoo" | "baidu" | "other" | "not_applicable";

export interface TrafficAttribution {
  readonly traffic_channel: TrafficChannel;
  readonly search_engine: SearchEngine;
}

type AttributedSearchEngine = Exclude<SearchEngine, "not_applicable">;

const noSearchEngine = "not_applicable" satisfies SearchEngine;
const paidSearchMedia = new Set(["paid_search", "paidsearch", "sem"]);
const paidMedia = new Set(["cpc", "ppc", "paid"]);
const socialMedia = new Set(["social", "social-network", "social-media", "social_network", "social_media", "paid_social", "paidsocial", "organic_social"]);
const socialSources = new Set(["facebook", "fb", "instagram", "ig", "meta", "twitter", "x", "linkedin", "tiktok", "youtube", "pinterest", "reddit", "vk", "vkontakte", "telegram"]);
const socialDomains = ["facebook.com", "instagram.com", "twitter.com", "x.com", "t.co", "linkedin.com", "lnkd.in", "tiktok.com", "youtube.com", "youtu.be", "pinterest.com", "reddit.com", "vk.com", "vk.ru", "ok.ru", "t.me", "telegram.me"];
const organicSearchMedia = new Set(["organic", "organic_search", "organicsearch"]);
const campaignParameters = ["utm_source", "utm_medium", "utm_campaign", "utm_id"] as const;
const searchSourceAliases: Readonly<Record<Exclude<AttributedSearchEngine, "other">, ReadonlySet<string>>> = {
  google: new Set(["google", "google_ads", "googleads", "adwords"]),
  yandex: new Set(["yandex", "yandex_direct"]),
  bing: new Set(["bing", "microsoft", "microsoft_ads"]),
  duckduckgo: new Set(["duckduckgo"]),
  yahoo: new Set(["yahoo"]),
  baidu: new Set(["baidu"]),
};
const searchDomains: Readonly<Record<AttributedSearchEngine, readonly string[]>> = {
  google: [
    "google.com", "google.ru", "google.rs", "google.es", "google.de", "google.fr", "google.it", "google.ca",
    "google.co.uk", "google.com.au", "google.co.in", "google.co.jp", "google.com.br", "google.com.mx",
  ],
  yandex: ["yandex.ru", "yandex.com", "yandex.by", "yandex.kz", "yandex.uz", "yandex.com.tr"],
  bing: ["bing.com"],
  duckduckgo: ["duckduckgo.com"],
  yahoo: ["search.yahoo.com", "search.yahoo.co.jp"],
  baidu: ["baidu.com"],
  other: ["ecosia.org", "search.brave.com", "qwant.com", "startpage.com"],
};

export function resolveBrowserTrafficAttribution(): TrafficAttribution {
  if (typeof window === "undefined" || typeof document === "undefined") return unknownAttribution();
  return resolveTrafficAttribution(window.location.href, document.referrer);
}

export function resolveTrafficAttribution(pageUrl: string | undefined, referrer: string | undefined): TrafficAttribution {
  const page = parseUrl(pageUrl);
  if (!page) return unknownAttribution();

  const medium = normalizedParameter(page, "utm_medium");
  const source = normalizedParameter(page, "utm_source");
  const campaignEngine = searchEngineFromName(source);
  const referringPage = parseUrl(referrer);
  const referrerEngine = referringPage && referringPage.origin !== page.origin
    ? searchEngineFromHostname(referringPage.hostname) : undefined;
  // An explicit medium wins over incidental referrers and advertising click IDs.
  if (medium && socialMedia.has(medium)) {
    return { traffic_channel: "social", search_engine: noSearchEngine };
  }
  if (medium && organicSearchMedia.has(medium)) {
    return searchAttribution("organic_search", campaignEngine ?? (!source ? referrerEngine : undefined) ?? "other");
  }
  if (medium && paidSearchMedia.has(medium)) {
    return searchAttribution("paid_search", campaignEngine ?? (!source ? referrerEngine : undefined) ?? "other");
  }
  if (medium === "referral") return { traffic_channel: "referral", search_engine: noSearchEngine };
  if (medium && !paidMedia.has(medium)) return { traffic_channel: "campaign", search_engine: noSearchEngine };
  if (source && (socialSources.has(source) || socialDomains.some((domain) => matchesDomain(source, domain)))) {
    return { traffic_channel: "social", search_engine: noSearchEngine };
  }
  const paidClickEngine = searchEngineFromClickId(page);
  if (paidClickEngine || (medium && paidMedia.has(medium) && campaignEngine)) {
    return searchAttribution("paid_search", paidClickEngine ?? campaignEngine ?? "other");
  }
  if (normalizedParameter(page, "dclid") || campaignParameters.some((name) => normalizedParameter(page, name))) {
    return { traffic_channel: "campaign", search_engine: noSearchEngine };
  }

  if (!referrer?.trim()) return { traffic_channel: "direct", search_engine: noSearchEngine };
  if (!referringPage) return unknownAttribution();
  if (referringPage.origin === page.origin) return { traffic_channel: "internal", search_engine: noSearchEngine };

  if (socialDomains.some((domain) => matchesDomain(referringPage.hostname, domain))) {
    return { traffic_channel: "social", search_engine: noSearchEngine };
  }
  const searchEngine = searchEngineFromHostname(referringPage.hostname);
  return searchEngine
    ? searchAttribution("organic_search", searchEngine)
    : { traffic_channel: "referral", search_engine: noSearchEngine };
}

function parseUrl(value: string | undefined): URL | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function normalizedParameter(url: URL, name: string): string | undefined {
  return url.searchParams.get(name)?.trim().toLowerCase() || undefined;
}

function searchEngineFromClickId(url: URL): Exclude<AttributedSearchEngine, "other"> | undefined {
  if (normalizedParameter(url, "gclid")) return "google";
  if (normalizedParameter(url, "yclid")) return "yandex";
  if (normalizedParameter(url, "msclkid")) return "bing";
  return undefined;
}

function searchEngineFromName(value: string | undefined): AttributedSearchEngine | undefined {
  if (!value) return undefined;
  for (const [engine, aliases] of Object.entries(searchSourceAliases) as [Exclude<AttributedSearchEngine, "other">, ReadonlySet<string>][]) {
    if (aliases.has(value)) return engine;
  }
  return searchEngineFromHostname(value);
}

function searchEngineFromHostname(hostname: string): AttributedSearchEngine | undefined {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  for (const [engine, domains] of Object.entries(searchDomains) as [AttributedSearchEngine, readonly string[]][]) {
    if (domains.some((domain) => matchesDomain(normalized, domain))) return engine;
  }
  return undefined;
}

function matchesDomain(hostname: string, domain: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === domain || normalized.endsWith(`.${domain}`);
}

function searchAttribution(channel: "organic_search" | "paid_search", searchEngine: AttributedSearchEngine): TrafficAttribution {
  return { traffic_channel: channel, search_engine: searchEngine };
}

function unknownAttribution(): TrafficAttribution {
  return { traffic_channel: "unknown", search_engine: noSearchEngine };
}
