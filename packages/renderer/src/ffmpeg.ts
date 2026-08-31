import { spawn } from "node:child_process";

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal?: NodeJS.Signals;
  readonly stdout: string;
  readonly stderr: string;
}

export interface MediaProcessProgress {
  readonly durationSeconds: number;
  readonly onProgress: (progress: number) => void;
}

export interface MediaProcessRunner {
  run(executable: "ffmpeg" | "ffprobe", args: readonly string[], signal?: AbortSignal, progress?: MediaProcessProgress): Promise<ProcessResult>;
}

export class SpawnMediaProcessRunner implements MediaProcessRunner {
  async run(
    executable: "ffmpeg" | "ffprobe",
    args: readonly string[],
    signal?: AbortSignal,
    progress?: MediaProcessProgress,
  ): Promise<ProcessResult> {
    if (args.some((argument) => argument.includes("\0"))) throw new Error("media process arguments cannot contain NUL bytes");
    if (progress && (!Number.isFinite(progress.durationSeconds) || progress.durationSeconds <= 0)) {
      throw new Error("media process progress duration must be positive");
    }
    return await new Promise((resolve, reject) => {
      const processArgs = executable === "ffmpeg" && progress
        ? ["-progress", "pipe:1", "-nostats", ...args]
        : [...args];
      const child = spawn(executable, processArgs, { shell: false, windowsHide: true, signal });
      let stdout = "";
      let stderr = "";
      let progressBuffer = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
        if (!progress) return;
        progressBuffer += chunk;
        const lines = progressBuffer.split(/\r?\n/);
        progressBuffer = lines.pop() ?? "";
        for (const line of lines) reportFfmpegProgress(line, progress);
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (exitCode, signal) => {
        if (progressBuffer && progress) reportFfmpegProgress(progressBuffer, progress);
        resolve({
          exitCode,
          ...(signal ? { signal } : {}),
          stdout,
          stderr,
        });
      });
    });
  }
}

function reportFfmpegProgress(line: string, progress: MediaProcessProgress): void {
  const separator = line.indexOf("=");
  if (separator < 0) return;
  const key = line.slice(0, separator);
  const value = line.slice(separator + 1);
  if (key === "progress" && value === "end") {
    progress.onProgress(1);
    return;
  }
  if (key !== "out_time_us") return;
  const elapsedMicroseconds = Number(value);
  if (!Number.isFinite(elapsedMicroseconds)) return;
  progress.onProgress(Math.max(0, Math.min(1, elapsedMicroseconds / 1_000_000 / progress.durationSeconds)));
}

export async function probeMedia(path: string, runner: MediaProcessRunner = new SpawnMediaProcessRunner()): Promise<unknown> {
  const result = await runner.run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]);
  if (result.exitCode !== 0) throw new Error(`ffprobe failed (${result.exitCode}): ${result.stderr.trim()}`);
  return JSON.parse(result.stdout) as unknown;
}
