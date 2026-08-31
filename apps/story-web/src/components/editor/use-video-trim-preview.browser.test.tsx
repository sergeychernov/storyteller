import { fireEvent, render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useVideoTrimPreview } from "./use-video-trim-preview.js";

test("allows collage video previews to play concurrently", () => {
  const { container } = render(<ConcurrentVideoPreviews />);
  const videos = [...container.querySelectorAll("video")];
  const firstPause = vi.spyOn(videos[0]!, "pause").mockImplementation(() => undefined);
  vi.spyOn(videos[1]!, "pause").mockImplementation(() => undefined);

  fireEvent.play(videos[0]!);
  fireEvent.play(videos[1]!);

  expect(firstPause).not.toHaveBeenCalled();
});

function ConcurrentVideoPreviews() {
  return <>{["first", "second"].map((id) => <ConcurrentVideo key={id} id={id} />)}</>;
}

function ConcurrentVideo({ id }: { readonly id: string }) {
  const preview = useVideoTrimPreview({
    url: undefined,
    sourceDurationSeconds: 4,
    trim: undefined,
    disabled: false,
    exclusivePlayback: false,
  });
  return <video aria-label={id} ref={preview.video} {...preview.mediaEvents} />;
}
