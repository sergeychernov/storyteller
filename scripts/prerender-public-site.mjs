import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAlternatePages, listPublicPages, publicSite } from "./public-site.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = join(repositoryRoot, "apps/web/dist");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function absoluteUrl(path) {
  return `${publicSite.origin}${path}`;
}

function renderHead(page, localeData) {
  const alternatePages = getAlternatePages(page.key);
  const alternates = alternatePages.map(({ hrefLang, page: alternate }) =>
    `    <link rel="alternate" hreflang="${hrefLang}" href="${absoluteUrl(alternate.path)}" data-public-seo>`,
  );
  const english = alternatePages.find(({ locale }) => locale === publicSite.defaultLocale)?.page;
  if (english) alternates.push(`    <link rel="alternate" hreflang="x-default" href="${absoluteUrl(english.path)}" data-public-seo>`);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.seoTitle,
    description: page.seoDescription,
    url: absoluteUrl(page.path),
    inLanguage: localeData.hrefLang,
    isPartOf: {
      "@type": "WebSite",
      name: publicSite.brand,
      url: publicSite.origin,
    },
  };

  return [
    `    <meta name="description" content="${escapeHtml(page.seoDescription)}" data-public-seo>`,
    "    <meta name=\"robots\" content=\"index, follow, max-image-preview:large\" data-public-seo>",
    `    <link rel="canonical" href="${absoluteUrl(page.path)}" data-public-seo>`,
    ...alternates,
    `    <meta property="og:type" content="website" data-public-seo>`,
    `    <meta property="og:site_name" content="${publicSite.brand}" data-public-seo>`,
    `    <meta property="og:title" content="${escapeHtml(page.seoTitle)}" data-public-seo>`,
    `    <meta property="og:description" content="${escapeHtml(page.seoDescription)}" data-public-seo>`,
    `    <meta property="og:url" content="${absoluteUrl(page.path)}" data-public-seo>`,
    `    <meta property="og:locale" content="${localeData.ogLocale}" data-public-seo>`,
    "    <meta name=\"twitter:card\" content=\"summary\" data-public-seo>",
    `    <meta name="twitter:title" content="${escapeHtml(page.seoTitle)}" data-public-seo>`,
    `    <meta name="twitter:description" content="${escapeHtml(page.seoDescription)}" data-public-seo>`,
    `    <script type="application/ld+json" data-public-seo>${JSON.stringify(structuredData).replaceAll("<", "\\u003c")}</script>`,
  ].join("\n");
}

function renderStaticPage(page, localeData) {
  const pagesByKey = new Map(localeData.pages.map((candidate) => [candidate.key, candidate]));
  const nav = Object.entries(localeData.nav).map(([key, label]) => {
    const target = pagesByKey.get(key);
    return `<a href="${target.path}"${target.key === page.key ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
  }).join("");
  const languages = getAlternatePages(page.key).map(({ hrefLang, languageName, page: alternate }) =>
    `<a href="${alternate.path}" hreflang="${hrefLang}"${alternate.path === page.path ? ' aria-current="page"' : ""}>${escapeHtml(languageName)}</a>`,
  ).join("");
  const proofPoints = page.proofPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  const sections = page.sections.map((section) => `
        <section>
          <p>${escapeHtml(section.eyebrow)}</p>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.intro)}</p>
          <div>${section.items.map((item) => `<article><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p></article>`).join("")}</div>
        </section>`).join("");
  const related = page.related.map((key) => {
    const target = pagesByKey.get(key);
    return `<a href="${target.path}">${escapeHtml(localeData.nav[key])}</a>`;
  }).join("");

  return `
      <a href="#content">${escapeHtml(localeData.skipToContent)}</a>
      <header>
        <a href="${pagesByKey.get("home").path}">${publicSite.brand}</a>
        <nav aria-label="Primary">${nav}</nav>
        <nav aria-label="Languages">${languages}</nav>
        <a href="/sign-in">${escapeHtml(localeData.openStudio)}</a>
      </header>
      <main id="content">
        <section>
          <p>${escapeHtml(page.hero.eyebrow)}</p>
          <h1>${escapeHtml(page.hero.title)} <em>${escapeHtml(page.hero.accent)}</em></h1>
          <p>${escapeHtml(page.hero.description)}</p>
          <a href="/sign-in">${escapeHtml(localeData.openStudio)}</a>
          <p>${escapeHtml(localeData.earlyAccess)}</p>
          <ul>${proofPoints}</ul>
        </section>${sections}
        <aside>${related}</aside>
        <section><h2>${escapeHtml(localeData.finalTitle)}</h2><p>${escapeHtml(localeData.finalBody)}</p><a href="/sign-in">${escapeHtml(localeData.openStudio)}</a></section>
      </main>
      <footer><a href="${pagesByKey.get("home").path}">${publicSite.brand}</a><p>${escapeHtml(localeData.footer)}</p></footer>`;
}

export function renderSitemap() {
  const entries = listPublicPages().map((page) => {
    const links = getAlternatePages(page.key).map(({ hrefLang, page: alternate }) =>
      `    <xhtml:link rel="alternate" hreflang="${hrefLang}" href="${absoluteUrl(alternate.path)}"/>`,
    );
    const english = getAlternatePages(page.key).find(({ locale }) => locale === publicSite.defaultLocale)?.page;
    if (english) links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${absoluteUrl(english.path)}"/>`);
    return `  <url>\n    <loc>${absoluteUrl(page.path)}</loc>\n${links.join("\n")}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`;
}

export async function prerenderPublicSite(outputDirectory = outputRoot) {
  const template = await readFile(join(outputDirectory, "index.html"), "utf8");
  await writeFile(join(outputDirectory, "app.html"), template);
  for (const [locale, localeData] of Object.entries(publicSite.locales)) {
    for (const page of localeData.pages) {
      const outputPath = page.path === "/" ? join(outputDirectory, "index.html") : join(outputDirectory, page.path.slice(1), "index.html");
      const html = template
        .replace(/<html lang="[^"]*">/, `<html lang="${locale}">`)
        .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(page.seoTitle)}</title>`)
        .replace(/\s*<meta name="robots"[^>]*>/, "")
        .replace("</head>", `${renderHead(page, localeData)}\n  </head>`)
        .replace('<div id="root"></div>', `<div id="root">${renderStaticPage(page, localeData)}</div>`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, html);
    }
  }

  await writeFile(join(outputDirectory, "sitemap.xml"), renderSitemap());
  await writeFile(join(outputDirectory, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /sign-in\nDisallow: /stories\n\nSitemap: ${publicSite.origin}/sitemap.xml\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await prerenderPublicSite();
