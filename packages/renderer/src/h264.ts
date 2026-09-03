import { frameRateExpression, type RationalFrameRate } from "@storyteller/domain";

export function h264SegmentArguments(frameRate: RationalFrameRate, lossless: boolean, threads = 1, lowMemory = false): string[] {
  const fps = frameRateExpression(frameRate);
  const gop = Math.max(1, Math.round(frameRate.numerator / frameRate.denominator * 2));
  // x264 represents QP 0 streams as High 4:4:4 Predictive even when the
  // encoded pixel format is 4:2:0. Forcing the regular High profile makes
  // every lossless scene-frame encode fail before the first packet is written.
  const profile = lossless ? "high444" : "high";
  return [
    "-c:v", "libx264", "-threads", String(threads),
    ...(lossless ? ["-preset", "ultrafast", "-qp", "0"] : ["-preset", "veryfast", "-crf", "20"]),
    "-pix_fmt", "yuv420p", "-profile:v", profile, "-level:v", "4.2",
    "-r", fps, "-fps_mode", "cfr", "-g", String(gop), "-keyint_min", String(gop), "-sc_threshold", "0",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited"
      + (lowMemory ? ":rc-lookahead=0:sync-lookahead=0" : ""),
    "-video_track_timescale", String(frameRate.numerator * 1_000), "-movflags", "+faststart",
  ];
}
