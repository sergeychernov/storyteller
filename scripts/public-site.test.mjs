import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { prerenderPublicSite, renderSitemap } from "./prerender-public-site.mjs";
import { getAlternatePages, listPublicPages, publicSite } from "./public-site.mjs";

const expectedKeys = ["features", "home", "personal", "travel"];

test("public site has complete localized page families and stable slugs", () => {
  assert.deepEqual(Object.keys(publicSite.locales), ["en", "ru", "sr-Latn"]);
  const pages = listPublicPages();
  assert.equal(pages.length, 12);
  assert.equal(new Set(pages.map((page) => page.path)).size, pages.length);

  for (const locale of Object.values(publicSite.locales)) {
    assert.ok(locale.overall.length > 0);
    assert.deepEqual(locale.pages.map((page) => page.key).sort(), expectedKeys);
    for (const page of locale.pages) {
      if (locale.code === "en") assert.equal(page.path.startsWith("/en"), false);
      else assert.match(page.path, new RegExp(`^/${locale.code}(?:/|$)`));
      if (page.path !== "/") assert.equal(page.path.endsWith("/"), false);
      assert.ok(page.seoTitle.includes(publicSite.brand));
      assert.ok(page.seoDescription.length >= 100);
      assert.equal(page.proofPoints.length, 3);
      assert.ok(page.sections.every((section) => section.items.length >= 3));
    }
  }

  assert.equal(publicSite.locales.en.pages.find((page) => page.key === "home")?.path, "/");
  assert.equal(publicSite.locales.en.pages.find((page) => page.key === "travel")?.path, "/travel-stories");
  assert.equal(publicSite.locales.ru.pages.find((page) => page.key === "travel")?.path, "/ru/istorii-o-puteshestviyah");
  assert.equal(publicSite.locales.ru.pages.find((page) => page.key === "features")?.path, "/ru/vozmozhnosti");
});

test("each page family exposes reciprocal language alternates", () => {
  for (const key of expectedKeys) {
    const alternates = getAlternatePages(key);
    assert.equal(alternates.length, 3);
    assert.deepEqual(alternates.map(({ hrefLang }) => hrefLang), ["en", "ru", "sr-Latn"]);
    assert.ok(alternates.every(({ page }) => page?.key === key));
  }
});

test("sitemap includes every canonical page and hreflang family", () => {
  const sitemap = renderSitemap();
  for (const page of listPublicPages()) assert.match(sitemap, new RegExp(`<loc>${publicSite.origin}${page.path}</loc>`));
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 12);
  assert.equal((sitemap.match(/hreflang="x-default"/g) ?? []).length, 12);
  assert.equal(sitemap.includes("undefined"), false);
});

test("prerender writes crawlable HTML, sitemap and robots policy", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "make-it-a-story-site-"));
  context.after(async () => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "index.html"), '<!doctype html><html lang="en"><head><meta name="robots" content="noindex, nofollow"><title>App</title></head><body><div id="root"></div></body></html>');

  await prerenderPublicSite(directory);
  const englishHome = await readFile(join(directory, "index.html"), "utf8");
  const appShell = await readFile(join(directory, "app.html"), "utf8");
  assert.match(englishHome, /<h1>Not a photo dump\./);
  assert.match(englishHome, /rel="canonical" href="https:\/\/makeitastory\.app\/"/);
  assert.match(appShell, /noindex, nofollow/);
  const russianHome = await readFile(join(directory, "ru/index.html"), "utf8");
  assert.match(russianHome, /<html lang="ru">/);
  assert.match(russianHome, /<h1>Не клип из фото\./);
  assert.match(russianHome, /rel="canonical" href="https:\/\/makeitastory\.app\/ru"/);
  assert.match(russianHome, /hreflang="en" href="https:\/\/makeitastory\.app\/"/);
  assert.match(russianHome, /name="robots" content="index, follow, max-image-preview:large"/);
  assert.equal(russianHome.includes("noindex"), false);
  assert.equal(russianHome.includes("undefined"), false);

  const robots = await readFile(join(directory, "robots.txt"), "utf8");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/app/);
  assert.match(robots, /Sitemap: https:\/\/makeitastory\.app\/sitemap\.xml/);
});
