import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NativeDragSafeVideo, preventNativeMediaAction } from "./NativeDragSafeVideo.js";

test("timeline video cannot become a native long-press or browser-drag target", () => {
  const markup = renderToStaticMarkup(<NativeDragSafeVideo src="video.mp4" />);
  assert.match(markup, /<video/);
  assert.match(markup, /draggable="false"/);
  assert.match(markup, /disablePictureInPicture=""/);
  assert.match(markup, /disableRemotePlayback=""/);
  assert.match(markup, /pointer-events:none/);
  assert.match(markup, /user-select:none/);
  assert.match(markup, /touch-action:none/);
});

test("native media actions are canceled before Chrome can open its menu", () => {
  let prevented = false;
  preventNativeMediaAction({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});
