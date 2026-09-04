import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { brandAssetFiles, resolveBrandAssetPath } from "./vite-brand-assets.mjs";

const repositoryRoot = new URL("../", import.meta.url);
const brandRoot = new URL("../packages/web-ui/brand/", import.meta.url);

test("the approved mark geometry stays canonical across display and compact masters", async () => {
  const display = await text("master/turning-point-mark.svg");
  const compact = await text("master/turning-point-mark-compact.svg");
  assert.match(display, /viewBox="0 0 512 512"/);
  assert.match(display, /translate\(-10 36\)/);
  assert.match(display, /L236 216L185 207/);
  assert.match(compact, /viewBox="0 0 16 16"/);
  assert.match(compact, /translate\(-\.32 1\.15\)/);
});

test("all three outlined Story lockups integrate the mark as the initial S", async () => {
  for (const [slug, title] of [
    ["make-it-a-story", "Make It a Story"],
    ["make-clip-a-story", "Make Clip a Story"],
    ["make-travel-a-story", "Make Travel a Story"],
  ]) {
    const lockup = await text(`exports/svg/${slug}-lockup.svg`);
    assert.match(lockup, new RegExp(`<title id="title">${title} logo</title>`));
    assert.doesNotMatch(lockup, /<text\b/);
    assert.match(lockup, /translate\(-10 36\)/);
    assert.match(lockup, /<path d="M416 76H184/);
    assert.match(lockup, /fill="#22221d"/);
    assert.match(lockup, /fill="#697c37"/);

    const black = await text(`exports/svg/${slug}-lockup-black.svg`);
    assert.match(black, /fill="#000000"/);
    assert.doesNotMatch(black, /fill="#697c37"/);

    const light = await text(`exports/svg/${slug}-lockup-light.svg`);
    assert.match(light, /fill="#ffffff"/);
    assert.doesNotMatch(light, /fill="#697c37"/);
  }
});

test("favicon and neutral icon exports have the required pixel sizes", async () => {
  for (const [path, size] of [
    ["exports/web/favicon-16x16.png", 16],
    ["exports/web/favicon-32x32.png", 32],
    ["exports/web/apple-touch-icon.png", 180],
    ["exports/png/make-it-a-story-icon-192.png", 192],
    ["exports/png/make-it-a-story-icon-512.png", 512],
    ["exports/png/make-it-a-story-icon-1024.png", 1024],
  ]) {
    const source = await readFile(new URL(path, brandRoot));
    assert.equal(source.toString("hex", 1, 4), "504e47");
    assert.equal(source.readUInt32BE(16), size);
    assert.equal(source.readUInt32BE(20), size);
  }

  const ico = await readFile(new URL("exports/web/favicon.ico", brandRoot));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([ico[6], ico[22], ico[38]], [16, 32, 48]);
});

test("every public brand asset comes from the shared package and every frontend declares it", async () => {
  for (const publicPath of Object.keys(brandAssetFiles)) {
    const path = resolveBrandAssetPath(publicPath);
    assert.ok(path, publicPath);
    assert.ok((await readFile(path)).byteLength > 0, publicPath);
  }

  for (const path of ["apps/site/index.html", "apps/story-web/index.html", "apps/clip-web/index.html"]) {
    const html = await readFile(new URL(path, repositoryRoot), "utf8");
    assert.match(html, /href="\/favicon\.svg"/);
    assert.match(html, /href="\/favicon\.ico"/);
    assert.match(html, /href="\/favicon-16x16\.png"/);
    assert.match(html, /href="\/favicon-32x32\.png"/);
    assert.match(html, /href="\/apple-touch-icon\.png"/);
  }
});

async function text(path) {
  return readFile(new URL(path, brandRoot), "utf8");
}
