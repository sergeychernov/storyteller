import assert from "node:assert/strict";
import test from "node:test";
import { probeMedia, type MediaProcessRunner } from "./index.js";

test("probeMedia uses an argument array and parses JSON", async () => {
  let received: readonly string[] = [];
  const runner: MediaProcessRunner = {
    async run(executable, args) {
      assert.equal(executable, "ffprobe");
      received = args;
      return { exitCode: 0, stdout: '{"streams":[]}', stderr: "" };
    },
  };
  assert.deepEqual(await probeMedia("clip with spaces.mp4", runner), { streams: [] });
  assert.equal(received.at(-1), "clip with spaces.mp4");
});
