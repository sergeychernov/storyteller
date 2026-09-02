import assert from "node:assert/strict";
import test from "node:test";
import { requireLocalSmokeEnvironment, smokeMixFfmpegArguments } from "./prepare-story-export-smoke.js";

test("smoke export mix uses the approved AAC-LC audio profile and exact timeline duration", () => {
  const arguments_ = smokeMixFfmpegArguments(1001 / 30_000, "/tmp/smoke.m4a");

  assert.deepEqual(arguments_.slice(-3), ["-movflags", "+faststart", "/tmp/smoke.m4a"]);
  assert.ok(arguments_.includes("anullsrc=r=48000:cl=stereo"));
  assert.equal(arguments_[arguments_.indexOf("-t") + 1], "0.033366667");
  assert.equal(arguments_[arguments_.indexOf("-profile:a") + 1], "aac_low");
  assert.equal(arguments_[arguments_.indexOf("-ar") + 1], "48000");
  assert.equal(arguments_[arguments_.indexOf("-ac") + 1], "2");
});

test("smoke export preparation accepts only a local database and local object storage", () => {
  assert.equal(requireLocalSmokeEnvironment({ DATABASE_URL: "postgresql://storyteller@localhost/storyteller" }), "postgresql://storyteller@localhost/storyteller");
  assert.equal(requireLocalSmokeEnvironment({ DATABASE_URL: "postgresql://storyteller@127.0.0.1/storyteller", MEDIA_STORAGE_DRIVER: "local" }), "postgresql://storyteller@127.0.0.1/storyteller");
  assert.throws(() => requireLocalSmokeEnvironment({ NODE_ENV: "production", DATABASE_URL: "postgresql://storyteller@localhost/storyteller" }), /disabled in production/u);
  assert.throws(() => requireLocalSmokeEnvironment({ DATABASE_URL: "postgresql://storyteller@database.example/storyteller" }), /refuses a non-local/u);
  assert.throws(() => requireLocalSmokeEnvironment({ DATABASE_URL: "postgresql://storyteller@localhost/storyteller", MEDIA_STORAGE_DRIVER: "s3" }), /requires MEDIA_STORAGE_DRIVER=local/u);
});
