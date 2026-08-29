import { probeMedia, SpawnMediaProcessRunner, type MediaProcessRunner } from "./ffmpeg.js";

export const lastFrameRendererVersion = 1;
export const sceneFramePngCompressionLevel = 6;

export interface LastFrameRenderSpec {
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly compressionLevel?: number;
}

/**
 * Selects the last indexed video frame and encodes only that frame as lossless PNG,
 * without relying on container duration rounding or a minimum source FPS.
 */
export async function renderLastFrame(
  spec: LastFrameRenderSpec,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<void> {
  const compressionLevel = spec.compressionLevel ?? sceneFramePngCompressionLevel;
  if (!Number.isInteger(compressionLevel) || compressionLevel < 0 || compressionLevel > 9) {
    throw new Error("PNG compression level must be between 0 and 9");
  }
  const metadata = await probeMedia(spec.sourcePath, runner) as {
    streams?: { codec_type?: string; nb_frames?: string | number }[];
  };
  const frameCount = Number(metadata.streams?.find(({ codec_type }) => codec_type === "video")?.nb_frames);
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) throw new Error("rendered scene has no indexed video frames");
  const result = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", spec.sourcePath,
    "-map", "0:v:0", "-an", "-map_metadata", "-1",
    "-vf", `select=eq(n\\,${frameCount - 1})`, "-frames:v", "1",
    "-compression_level", String(compressionLevel), spec.outputPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`last frame extraction failed (${result.exitCode}): ${result.stderr.trim()}`);
}
