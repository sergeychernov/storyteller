import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  AccessControlService,
  ApplicationError,
  StoryApplication,
  createBaselineAccessState,
  type AccessState,
  type EffectiveAccess,
  type PlatformCredentialSummary,
  type ProductActivityRecord,
  type ProfileAuthentication,
  type SessionRecord,
  type StoryRepository,
} from "@storyteller/application";
import { getMaterialPresentation, materialStorageKeys, type PlatformCredential, type PlatformProvider, type Profile, type ProfileUpdate, type SceneMaterial, type Story } from "@storyteller/domain";
import type { ObjectDeletionJob, SceneRenderJob, SceneRenderQueue } from "@storyteller/render-queue";
import { probeMedia, renderVideo, SpawnMediaProcessRunner } from "@storyteller/renderer";
import { Readable } from "node:stream";
import type { LightMyRequestResponse } from "fastify";
import type { OpenAPIV3 } from "openapi-types";
import { sceneRenderFileType, sceneRenderSlot, sceneRenderStorageKey } from "@storyteller/render-queue";
import type { StoryTimelineResponse } from "@storyteller/schemas";
import sharp from "sharp";
import { normalizeStoredStory } from "./database.js";
import { buildApi } from "./server.js";
import { detectMediaMetadata, MediaStorage } from "./media-storage.js";
import { LocalObjectStorage, S3ObjectStorage } from "./object-storage.js";
import { accessPolicyForRoute } from "./access-control.js";
import { buildSceneRenderInput } from "./scene-render-input.js";
import { MemoryRenderQueue, MemoryRepository, multipartFile, renderFixture } from "./app-test-support.js";

process.env.NODE_ENV = "test";

test("serves each crop/rotation result without caching old pixels and renders the edited dimensions", async (context) => {
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-edit-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const objectStorage = new LocalObjectStorage(mediaRoot);
  const renderQueue = new MemoryRenderQueue();
  const api = await buildApi(new StoryApplication(new MemoryRepository()), {
    mediaStorage: new MediaStorage(objectStorage), objectStorage, renderQueue,
  });
  context.after(() => api.close());
  const registration = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { name: "Editor test", email: "editor@example.com", password: "long-test-password" },
  });
  const headers = { authorization: `Bearer ${registration.json<{ accessToken: string }>().accessToken}` };
  const storyResponse = await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "Edited pixels" } });
  const storyId = storyResponse.json<{ id: string }>().id;
  const withScene = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes`, headers });
  const sceneId = withScene.json<Story>().scenes[0]!.id;
  const red = [255, 0, 0], green = [0, 255, 0], blue = [0, 0, 255], white = [255, 255, 255];
  const cyan = [0, 255, 255], magenta = [255, 0, 255], yellow = [255, 255, 0], black = [0, 0, 0];
  const png = await sharp(Buffer.from([red, green, blue, white, cyan, magenta, yellow, black].flat()), {
    raw: { width: 4, height: 2, channels: 3 },
  }).png().toBuffer();
  const multipart = multipartFile("color-grid.png", "image/png", png);
  const uploaded = await api.inject({
    method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/materials`,
    payload: multipart.body, headers: { ...headers, "content-type": multipart.contentType },
  });
  const original = uploaded.json<Story>().scenes[0]!.materials[0]!;
  assert.equal((await api.inject({
    method: "GET", url: `/stories/${storyId}/materials/${original.id}/waveform`, headers,
  })).statusCode, 422);
  const invalidTrim = await api.inject({
    method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers,
    payload: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 }, trim: { startSeconds: 0, endSeconds: 1 } },
  });
  assert.equal(invalidTrim.statusCode, 422);
  let previousKey: string | undefined;
  for (const [edit, size, pixels] of [
    [{ rotation: 90, crop: { x: 0, y: 0, width: 1, height: 1 } }, [2, 4], [cyan, red, magenta, green, yellow, blue, black, white]],
    [{ rotation: 270, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }, [1, 2], [white, blue]],
  ] as const) {
    const response = await api.inject({
      method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers, payload: edit,
    });
    assert.equal(response.statusCode, 200, response.body);
    const material = response.json<Story>().scenes[0]!.materials[0]!;
    const result = material.edit!.result!;
    assert.equal(material.storageKey, original.storageKey);
    assert.deepEqual([material.width, material.height], [4, 2]);
    assert.deepEqual([result.width, result.height], size);
    assert.equal(result.orientation, "portrait");
    assert.deepEqual({ rotation: material.edit!.rotation, crop: material.edit!.crop }, edit);
    if (previousKey) await assert.rejects(access(join(mediaRoot, previousKey)), { code: "ENOENT" });
    previousKey = result.storageKey;
    const content = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
    assert.equal(content.headers["cache-control"], "private, no-store");
    assert.equal(result.contentHash, createHash("sha256").update(content.rawPayload).digest("hex"));
    const decoded = await sharp(content.rawPayload).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([decoded.info.width, decoded.info.height], size);
    assert.deepEqual(decoded.data, Buffer.from(pixels.flat()));
    const source = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/source-content`, headers });
    assert.deepEqual(source.rawPayload, png);
    const render = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/renders`, headers });
    assert.equal(render.statusCode, 202, render.body);
    const job = [...renderQueue.jobs.values()].find(({ id }) => id === render.json<{ id: string }>().id)!;
    assert.equal(job.input.rendererId, "still-image");
    if (job.input.rendererId !== "still-image") throw new Error("expected still-image render input");
    assert.equal(job.input.material.storageKey, result.storageKey);
    assert.deepEqual([job.input.material.width, job.input.material.height], size);
    assert.equal(job.input.material.orientation, "portrait");
  }
  assert.equal(renderQueue.jobs.size, 1);
  const reset = await api.inject({
    method: "PATCH", url: `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`, headers,
    payload: { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } },
  });
  assert.equal(reset.json<Story>().scenes[0]!.materials[0]!.edit, undefined);
  await assert.rejects(access(join(mediaRoot, previousKey!)), { code: "ENOENT" });
  const restored = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
  assert.equal(restored.headers["cache-control"], "private, no-store");
  assert.deepEqual(restored.rawPayload, png);
});

test("stores separate processed tracks, saves video edits as metadata, and exports each selected mode", async (context) => {
  const runner = new SpawnMediaProcessRunner();
  const mediaRoot = await mkdtemp(join(tmpdir(), "storyteller-video-test-"));
  context.after(() => rm(mediaRoot, { recursive: true, force: true }));
  const sourcePath = join(mediaRoot, "colors.mp4");
  async function ffmpeg(args: readonly string[]) {
    const result = await runner.run("ffmpeg", ["-y", "-v", "error", ...args]);
    assert.equal(result.exitCode, 0, result.stderr);
  }
  await ffmpeg([
    "-f", "lavfi", "-i", "color=c=red:s=160x96:r=10:d=2",
    "-f", "lavfi", "-i", "color=c=green:s=160x96:r=10:d=2",
    "-f", "lavfi", "-i", "color=c=blue:s=160x96:r=10:d=2",
    "-f", "lavfi", "-i", "aevalsrc=0.1*sin(2*PI*440*t)*(0.1+0.9*t/6):s=44100:d=6",
    "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-map", "3:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", sourcePath,
  ]);
  // A partial upload must leave neither its archive nor one of its working tracks behind.
  const sourceBytes = await readFile(sourcePath);
  for (const failAt of [1, 2, 3]) {
    const rollbackRoot = join(mediaRoot, `rollback-${failAt}`);
    const rollbackObjects = new LocalObjectStorage(rollbackRoot);
    let puts = 0;
    const failingStorage = new MediaStorage({
      open: (key) => rollbackObjects.open(key), delete: (key) => rollbackObjects.delete(key),
      async put(key, object) {
        await rollbackObjects.put(key, object);
        if (++puts === failAt) throw new Error("simulated object upload failure");
      },
    });
    await assert.rejects(failingStorage.store({ filename: "source.mp4", mimetype: "video/mp4", file: Readable.from(sourceBytes) },
      { profileId: "profile", storyId: "story", sceneId: "scene" }));
    assert.deepEqual((await readdir(rollbackRoot, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()), []);
  }
  const objectsRoot = join(mediaRoot, "objects");
  const objectStorage = new LocalObjectStorage(objectsRoot);
  const repository = new MemoryRepository();
  const renderQueue = new MemoryRenderQueue();
  let processCalls = 0;
  const mediaStorage = new MediaStorage(objectStorage, { async run(command, args) {
    processCalls += 1;
    return runner.run(command, args);
  } });
  const api = await buildApi(new StoryApplication(repository), { mediaStorage, objectStorage, renderQueue });
  context.after(() => api.close());
  const registration = await api.inject({
    method: "POST", url: "/auth/sign-in", payload: { name: "Video test", email: "video@example.com", password: "long-test-password" },
  });
  const headers = { authorization: `Bearer ${registration.json<{ accessToken: string }>().accessToken}` };
  const other = await api.inject({ method: "POST", url: "/auth/sign-in", payload: { name: "Other", email: "other@example.com", password: "long-test-password" } });
  const otherHeaders = { authorization: `Bearer ${other.json<{ accessToken: string }>().accessToken}` };
  const storyId = (await api.inject({ method: "POST", url: "/stories", headers, payload: { title: "Video edits" } })).json<Story>().id;
  const identity = { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } } as const;

  for (const hasAudio of [true, false]) {
    const sceneId = (await api.inject({ method: "POST", url: `/stories/${storyId}/scenes`, headers })).json<Story>().scenes.at(-1)!.id;
    const uploadPath = hasAudio ? sourcePath : join(mediaRoot, "silent.mp4");
    if (!hasAudio) await ffmpeg(["-i", sourcePath, "-an", "-c:v", "copy", uploadPath]);
    const originalBytes = await readFile(uploadPath);
    const multipart = multipartFile("colors.mp4", "video/mp4", originalBytes);
    const uploaded = await api.inject({ method: "POST", url: `/stories/${storyId}/scenes/${sceneId}/materials`,
      payload: multipart.body, headers: { ...headers, "content-type": multipart.contentType } });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const original = uploaded.json<Story>().scenes.at(-1)!.materials[0]!;
    assert.equal(original.kind, "video");
    if (original.kind !== "video") throw new Error("expected video");
    assert.ok(original.videoTrack);
    assert.equal(Boolean(original.audioTrack), hasAudio);
    assert.deepEqual(await readFile(join(objectsRoot, original.storageKey)), originalBytes);
    const videoBytes = await readFile(join(objectsRoot, original.videoTrack.storageKey));
    assert.equal(original.contentHash, createHash("sha256").update(originalBytes).digest("hex"));
    assert.equal(original.videoTrack.contentHash, createHash("sha256").update(videoBytes).digest("hex"));
    const tracks = await probeMedia(join(objectsRoot, original.videoTrack.storageKey)) as { streams: { codec_type: string }[] };
    assert.deepEqual(tracks.streams.map((stream) => stream.codec_type), ["video"]);
    const audioUrl = `/stories/${storyId}/materials/${original.id}/audio-content`;
    assert.equal((await api.inject({ method: "GET", url: audioUrl })).statusCode, 401);
    assert.equal((await api.inject({ method: "GET", url: audioUrl, headers: otherHeaders })).statusCode, 404);
    assert.equal((await api.inject({ method: "GET", url: audioUrl, headers })).statusCode, hasAudio ? 200 : 404);
    if (original.audioTrack) {
      const track = original.audioTrack;
      assert.equal(track.contentHash, createHash("sha256").update(await readFile(join(objectsRoot, track.storageKey))).digest("hex"));
      assert.equal(track.sampleRate, 48_000);
      assert.equal(track.channels, 2);
      assert.ok(Math.abs(track.durationSeconds - 6) < 0.05);
      assert.ok(Math.abs(track.processing.integratedLufs! + 16) < 1, JSON.stringify(track.processing));
      assert.ok(track.processing.truePeakDbfs! < 0);
      const audioProbe = await probeMedia(join(objectsRoot, track.storageKey)) as { streams: { codec_type: string }[] };
      assert.deepEqual(audioProbe.streams.map((stream) => stream.codec_type), ["audio"]);
    }
    const waveformUrl = `/stories/${storyId}/materials/${original.id}/waveform`;
    const waveformResponse = await api.inject({ method: "GET", url: waveformUrl, headers });
    assert.equal(waveformResponse.statusCode, 200, waveformResponse.body);
    const peaks = waveformResponse.json<{ peaks: number[] }>().peaks;
    assert.equal(peaks.length, hasAudio ? 512 : 0);
    if (hasAudio) assert.equal(Math.max(...peaks), 1);
    const editUrl = `/stories/${storyId}/scenes/${sceneId}/materials/${original.id}`;
    const renderUrl = `/stories/${storyId}/scenes/${sceneId}/renders`;
    assert.equal((await api.inject({ method: "POST", url: renderUrl, headers, payload: { mode: "invalid" } })).statusCode, 400);
    for (const [trim, status] of [
      [{ startSeconds: -1, endSeconds: 3 }, 400], [{ startSeconds: 3, endSeconds: 3 }, 400],
      [{ startSeconds: 4, endSeconds: 3 }, 400], [{ startSeconds: 0, endSeconds: 7 }, 422],
    ] as const) assert.equal((await api.inject({ method: "PATCH", url: editUrl, headers, payload: { ...identity, trim } })).statusCode, status);

    for (const [edit, width, height, duration, channel] of [
      [{ ...identity, trim: { startSeconds: 2, endSeconds: 4 } }, 160, 96, 2, 1],
      [{ rotation: 90, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, trim: { startSeconds: 4.2, endSeconds: 5.5 } }, 48, 80, 1.3, 2],
    ] as const) {
      const callsBefore = processCalls;
      const filesBefore = await readdir(objectsRoot, { recursive: true });
      const edited = await api.inject({ method: "PATCH", url: editUrl, headers, payload: edit });
      assert.equal(edited.statusCode, 200, edited.body);
      assert.equal(processCalls, callsBefore, "editing must not decode or encode a video");
      assert.deepEqual(await readdir(objectsRoot, { recursive: true }), filesBefore, "editing must not create or replace files");
      const reopened = await api.inject({ method: "GET", url: `/stories/${storyId}`, headers });
      const persisted = normalizeStoredStory(reopened.json()).scenes.find((scene) => scene.id === sceneId)!.materials[0]!;
      assert.deepEqual(persisted.edit, edit);
      const presentation = getMaterialPresentation(persisted);
      assert.deepEqual([presentation.width, presentation.height], [width, height]);
      assert.ok(Math.abs(presentation.durationSeconds! - duration) < 0.001);
      assert.deepEqual(await readFile(join(objectsRoot, original.storageKey)), originalBytes);
      const content: LightMyRequestResponse = await api.inject({ method: "GET", url: `/stories/${storyId}/materials/${original.id}/content`, headers });
      assert.deepEqual(content.rawPayload, videoBytes);
      assert.deepEqual((await api.inject({ method: "GET", url: waveformUrl, headers })).json<{ peaks: number[] }>().peaks, peaks);

      for (const mode of ["video", "audio", "combined"] as const) {
        const requested = await api.inject({ method: "POST", url: renderUrl, headers, payload: { mode } });
        if (mode === "audio" && !hasAudio) { assert.equal(requested.statusCode, 422); continue; }
        assert.equal(requested.statusCode, 202, requested.body);
        const job = [...renderQueue.jobs.values()].find(({ id }) => id === requested.json<{ id: string }>().id)!;
        assert.equal(job.input.rendererId, "video");
        if (job.input.rendererId !== "video") throw new Error("expected video job");
        assert.equal(job.input.mode, mode);
        assert.deepEqual(job.input.edit, edit);
        const cached = await api.inject({ method: "POST", url: renderUrl, headers, payload: { mode } });
        assert.equal(cached.json<{ id: string }>().id, job.id);
        const file = sceneRenderFileType(job.input);
        const outputPath = join(mediaRoot, `export.${file.extension}`);
        await renderVideo({ sourcePath: join(objectsRoot, job.input.material.storageKey),
          ...(job.input.audio ? { audioPath: join(objectsRoot, job.input.audio.storageKey) } : {}),
          outputPath, sourceSize: job.input.material, sourceDurationSeconds: 6, hasAudio, mode, edit });
        const probe = await probeMedia(outputPath) as { streams: { codec_type: string; duration: string; start_time: string }[] };
        assert.deepEqual(probe.streams.map((stream) => stream.codec_type), mode === "audio" ? ["audio"] : mode === "combined" && hasAudio ? ["video", "audio"] : ["video"]);
        for (const stream of probe.streams) {
          assert.ok(Math.abs(Number(stream.duration) - duration) < 0.05, JSON.stringify(stream));
          assert.ok(Math.abs(Number(stream.start_time)) < 0.05, JSON.stringify(stream));
        }
        if (mode !== "audio") {
          const metadata = detectMediaMetadata(probe, "video");
          assert.deepEqual([metadata.width, metadata.height], [width, height]);
          for (const time of [0, duration - 0.2]) {
            const framePath = join(mediaRoot, "frame.png");
            await ffmpeg(["-ss", String(time), "-i", outputPath, "-frames:v", "1", framePath]);
            const frame = await sharp(await readFile(framePath)).stats();
            assert.ok(frame.channels[channel]!.mean > 100);
            assert.ok(frame.channels.filter((_, index) => index !== channel).every(({ mean }) => mean < 10));
          }
        }
        await ffmpeg(["-i", outputPath, "-f", "null", "-"]);
        const bytes = await readFile(outputPath);
        const key = sceneRenderStorageKey(job);
        await objectStorage.put(key, { body: Readable.from(bytes), contentType: file.mimeType, contentLength: bytes.length });
        await renderQueue.complete(job.id, "test", key, bytes.length, createHash("sha256").update(bytes).digest("hex"));
        const downloadUrl = `${renderUrl}/${job.id}/content`;
        assert.equal((await api.inject({ method: "GET", url: downloadUrl, headers: otherHeaders })).statusCode, 404);
        const downloaded = await api.inject({ method: "GET", url: downloadUrl, headers });
        assert.equal(downloaded.headers["content-type"], file.mimeType);
        assert.ok(downloaded.headers["content-disposition"]?.includes(`.${file.extension}`));
        assert.deepEqual(downloaded.rawPayload, bytes);
      }
    }
    const reset = await api.inject({ method: "PATCH", url: editUrl, headers, payload: identity });
    assert.equal(reset.statusCode, 200, reset.body);
    assert.equal(reset.json<Story>().scenes.find((scene) => scene.id === sceneId)!.materials[0]!.edit, undefined);
    assert.deepEqual(await readFile(join(objectsRoot, original.storageKey)), originalBytes);
    await api.inject({ method: "DELETE", url: editUrl, headers });
    for (const key of materialStorageKeys(original)) await assert.rejects(access(join(objectsRoot, key)), { code: "ENOENT" });
  }
});

test("detects displayed orientation, rotation and an audio stream from probe data", () => {
  assert.deepEqual(detectMediaMetadata({ streams: [{ codec_type: "video", width: 1080, height: 1920 }] }, "image"), {
    width: 1080, height: 1920, orientation: "portrait", hasAudio: false,
  });
  assert.deepEqual(detectMediaMetadata({ streams: [
    { codec_type: "video", width: 1920, height: 1080, avg_frame_rate: "30000/1001", r_frame_rate: "60/1", side_data_list: [{ rotation: -90 }] }, { codec_type: "audio" },
  ], format: { duration: "7.25" } }, "video"), {
    width: 1080, height: 1920, orientation: "portrait", hasAudio: true, sourceDurationSeconds: 7.25,
    sourceFrameRate: { numerator: 30000, denominator: 1001 },
  });
  assert.deepEqual(detectMediaMetadata({ streams: [
    { codec_type: "video", width: 1080, height: 1920, avg_frame_rate: "0/0", r_frame_rate: "24000/1001" },
  ], format: { duration: "3" } }, "video").sourceFrameRate, { numerator: 24000, denominator: 1001 });
});

test("creates a short-lived S3 download URL without exposing the secret key", async () => {
  const storage = new S3ObjectStorage({
    bucket: "storyteller-media",
    endpoint: "https://storage.example.com",
    region: "auto",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    downloadUrlTtlSeconds: 600,
  });
  const download = await storage.createDownloadUrl("profile/story/scene/material.png");
  const url = new URL(download.url);
  assert.equal(url.hostname, "storyteller-media.storage.example.com");
  assert.equal(url.pathname, "/profile/story/scene/material.png");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
  assert.equal(url.searchParams.has("X-Amz-Signature"), true);
  assert.equal(download.url.includes("test-secret-key"), false);
});
