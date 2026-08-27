import assert from "node:assert/strict";
import test from "node:test";
import { clampPlayheadToTrim, formatVideoTime, keyboardTimelineTime, timelineRatio, timelineTime, waveformPath } from "./video-timeline-model.js";

test("changing trim boundaries preserves the playhead unless a boundary passes it", () => {
  assert.equal(clampPlayheadToTrim(4, { startSeconds: 2, endSeconds: 8 }), 4);
  assert.equal(clampPlayheadToTrim(4, { startSeconds: 2, endSeconds: 6 }), 4);
  assert.equal(clampPlayheadToTrim(4, { startSeconds: 4, endSeconds: 6 }), 4);
  assert.equal(clampPlayheadToTrim(4, { startSeconds: 2, endSeconds: 4 }), 4);
  assert.equal(clampPlayheadToTrim(4, { startSeconds: 5, endSeconds: 8 }), 5);
  assert.equal(clampPlayheadToTrim(4, { startSeconds: 2, endSeconds: 3 }), 3);
  assert.equal(clampPlayheadToTrim(3, { startSeconds: 0, endSeconds: 8 }), 3);
});

test("timeline maps pointer positions into the original video and clamps outside the track", () => {
  assert.equal(timelineTime(160, 100, 240, 8), 2);
  assert.equal(timelineTime(0, 100, 240, 8), 0);
  assert.equal(timelineTime(500, 100, 240, 8), 8);
  assert.equal(timelineTime(160, 100, 0, 8), 0);
  assert.equal(timelineRatio(2, 8), 0.25);
  assert.equal(timelineRatio(Number.NaN, 8), 0);
  assert.equal(timelineRatio(1, 0), 0);
});

test("timeline keyboard controls support precise steps, larger steps and range limits", () => {
  assert.equal(keyboardTimelineTime("ArrowRight", 2, 1, 4, false), 2.01);
  assert.equal(keyboardTimelineTime("ArrowLeft", 2, 1, 4, true), 1.9);
  assert.equal(keyboardTimelineTime("ArrowLeft", 1, 1, 4, false), 1);
  assert.equal(keyboardTimelineTime("ArrowRight", 4, 1, 4, false), 4);
  assert.equal(keyboardTimelineTime("Home", 2, 1, 4, false), 1);
  assert.equal(keyboardTimelineTime("End", 2, 1, 4, false), 4);
  assert.equal(keyboardTimelineTime("Tab", 2, 1, 4, false), undefined);
});

test("waveform drawing uses actual peaks and leaves silence flat", () => {
  assert.equal(waveformPath([]), "");
  assert.match(waveformPath([0, 1, 0]), /L512.00 5.00/);
  assert.match(waveformPath([0, 1, 0]), /L512.00 59.00/);
  assert.doesNotMatch(waveformPath([0, 0]), /5.00|59.00/);
  assert.doesNotMatch(waveformPath([Number.NaN, Infinity, -1, 2]), /NaN|Infinity/);
});

test("video time labels retain hundredths and carry into the next minute", () => {
  assert.equal(formatVideoTime(0), "00:00.00");
  assert.equal(formatVideoTime(61.23), "01:01.23");
  assert.equal(formatVideoTime(59.999), "01:00.00");
});
