import { frameRateExpression, type RationalFrameRate } from "@storyteller/domain";

export function h264SegmentArguments(frameRate: RationalFrameRate, lossless: boolean, threads = 1): string[] {
  const fps = frameRateExpression(frameRate);
  const gop = Math.max(1, Math.round(frameRate.numerator / frameRate.denominator * 2));
  return [
    "-c:v", "libx264", "-threads", String(threads),
    ...(lossless ? ["-preset", "ultrafast", "-qp", "0"] : ["-preset", "veryfast", "-crf", "20"]),
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-level:v", "4.2",
    "-r", fps, "-fps_mode", "cfr", "-g", String(gop), "-keyint_min", String(gop), "-sc_threshold", "0",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited",
    "-video_track_timescale", String(frameRate.numerator * 1_000), "-movflags", "+faststart",
  ];
}
