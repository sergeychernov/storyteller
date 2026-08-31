import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { EventEmitter, once } from "node:events";
import test from "node:test";
import { createFrontendHost, registerFrontendHostShutdown } from "../apps/site/server.mjs";

test("one host isolates public, Story and Clip build roots", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "storyteller-frontends-"));
  const siteRoot = join(root, "site");
  const storyRoot = join(root, "story");
  const clipRoot = join(root, "clip");
  context.after(async () => rm(root, { recursive: true, force: true }));

  await Promise.all([
    writeFixture(siteRoot, "index.html", "SITE_PUBLIC"),
    writeFixture(siteRoot, "app.html", "SITE_APP"),
    writeFixture(siteRoot, "ru/index.html", "SITE_RU"),
    writeFixture(siteRoot, "assets/site.js", "SITE_ASSET"),
    writeFixture(storyRoot, "index.html", "STORY_APP"),
    writeFixture(storyRoot, "assets/story.js", "STORY_ASSET"),
    writeFixture(clipRoot, "index.html", "CLIP_APP"),
    writeFixture(clipRoot, "assets/clip.js", "CLIP_ASSET"),
  ]);

  const server = createFrontendHost({ siteRoot, storyRoot, clipRoot });
  const publicPage = await inject(server, "/");
  assert.equal(publicPage.status, 200);
  assert.equal(publicPage.body, "SITE_PUBLIC");
  assert.equal(publicPage.headers["X-Robots-Tag"], undefined);
  assert.equal(publicPage.headers["Cache-Control"], "no-cache");

  const signIn = await inject(server, "/sign-in");
  assert.equal(signIn.body, "SITE_APP");
  assert.equal(signIn.headers["X-Robots-Tag"], "noindex, nofollow");
  const profile = await inject(server, "/app/profile");
  assert.equal(profile.body, "SITE_APP");
  assert.equal(profile.headers["X-Robots-Tag"], "noindex, nofollow");
  assert.equal((await inject(server, "/app/profile/")).headers.Location, "/app/profile");
  const siteAsset = await inject(server, "/assets/site.js");
  assert.equal(siteAsset.body, "SITE_ASSET");
  assert.equal(siteAsset.headers["Cache-Control"], "public, max-age=31536000, immutable");
  assert.equal((await inject(server, "/app.html")).status, 404);

  const story = await inject(server, "/app/stories/story-1/scenes/scene-2");
  assert.equal(story.body, "STORY_APP");
  assert.equal(story.headers["X-Robots-Tag"], "noindex, nofollow");
  const storyAsset = await inject(server, "/app/stories/assets/story.js");
  assert.equal(storyAsset.body, "STORY_ASSET");
  assert.equal(storyAsset.headers["Cache-Control"], "public, max-age=31536000, immutable");
  assert.equal(storyAsset.headers["X-Robots-Tag"], "noindex, nofollow");

  const clip = await inject(server, "/app/clips");
  assert.equal(clip.body, "CLIP_APP");
  assert.equal((await inject(server, "/app/clips/assets/clip.js")).body, "CLIP_ASSET");
  assert.equal((await inject(server, "/app/clips/assets/story.js")).status, 404);
  assert.equal((await inject(server, "/app/stories/assets/clip.js")).status, 404);

  const legacy = await inject(server, "/stories/story-1/scenes/scene-2?tab=edit");
  assert.equal(legacy.status, 308);
  assert.equal(legacy.headers.Location, "/app/stories/story-1/scenes/scene-2?tab=edit");

  assert.equal((await inject(server, "/app/stories/assets/missing.js")).status, 404);
  assert.equal((await inject(server, "/app/unknown")).status, 404);
  assert.equal((await inject(server, "/ru/not-a-page")).status, 404);
  assert.equal((await inject(server, "/", "POST")).status, 405);
});

test("frontend host closes once when shutdown signals repeat", () => {
  const processTarget = new EventEmitter();
  const exits = [];
  let closeCalls = 0;
  const server = {
    close(callback) {
      closeCalls++;
      callback();
    },
  };
  const cleanup = registerFrontendHostShutdown(server, {
    processTarget,
    exit: (code) => exits.push(code),
  });

  processTarget.emit("SIGINT");
  processTarget.emit("SIGINT");
  processTarget.emit("SIGTERM");

  assert.equal(closeCalls, 1);
  assert.deepEqual(exits, [0]);
  assert.equal(processTarget.listenerCount("SIGINT"), 0);
  assert.equal(processTarget.listenerCount("SIGTERM"), 0);
  cleanup();
});

async function writeFixture(root, relativePath, contents) {
  const path = join(root, relativePath);
  await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await writeFile(path, contents);
}

async function inject(server, url, method = "GET") {
  const response = new TestResponse();
  server.emit("request", { method, url }, response);
  await once(response, "finish");
  return { status: response.status, headers: response.headers, body: Buffer.concat(response.chunks).toString("utf8") };
}

class TestResponse extends Writable {
  status = 200;
  headers = {};
  chunks = [];

  writeHead(status, headers = {}) {
    this.status = status;
    this.headers = headers;
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}
