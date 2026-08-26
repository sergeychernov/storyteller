import { spawn } from "node:child_process";

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal?: NodeJS.Signals;
  readonly stdout: string;
  readonly stderr: string;
}

export interface MediaProcessRunner {
  run(executable: "ffmpeg" | "ffprobe", args: readonly string[], signal?: AbortSignal): Promise<ProcessResult>;
}

export class SpawnMediaProcessRunner implements MediaProcessRunner {
  async run(executable: "ffmpeg" | "ffprobe", args: readonly string[], signal?: AbortSignal): Promise<ProcessResult> {
    if (args.some((argument) => argument.includes("\0"))) throw new Error("media process arguments cannot contain NUL bytes");
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, [...args], { shell: false, windowsHide: true, signal });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (exitCode, signal) => resolve({
        exitCode,
        ...(signal ? { signal } : {}),
        stdout,
        stderr,
      }));
    });
  }
}

export async function probeMedia(path: string, runner: MediaProcessRunner = new SpawnMediaProcessRunner()): Promise<unknown> {
  const result = await runner.run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path]);
  if (result.exitCode !== 0) throw new Error(`ffprobe failed (${result.exitCode}): ${result.stderr.trim()}`);
  return JSON.parse(result.stdout) as unknown;
}
