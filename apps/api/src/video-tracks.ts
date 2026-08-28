import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { AudioTrack, VideoTrack } from "@storyteller/domain";
import { prepareVideoAudio, type MediaProcessRunner } from "@storyteller/renderer";
import { hashFileContent, ObjectStorageError, type ObjectStorage } from "@storyteller/storage";

export async function storeVideoTracks(options: {
  sourcePath: string; directory: string; keyPrefix: string; extension: string; mimeType: string;
  hasAudio: boolean; durationSeconds: number;
}, objects: ObjectStorage, runner: MediaProcessRunner): Promise<{ videoTrack: VideoTrack; audioTrack?: AudioTrack }> {
  const { sourcePath, directory, keyPrefix, extension, mimeType, hasAudio, durationSeconds } = options;
  const videoPath = join(directory, `video.${extension}`);
  const audioPath = join(directory, "audio.m4a");
  const result = await runner.run("ffmpeg", [
    "-y", "-v", "error", "-i", sourcePath, "-map", "0:v:0", "-an", "-c:v", "copy",
    ...(["mp4", "mov", "3gp"].includes(extension) ? ["-movflags", "+faststart"] : []), videoPath,
  ]);
  if (result.exitCode !== 0) throw new Error(`could not separate video (${result.exitCode}): ${result.stderr.trim()}`);
  const audioMetadata = hasAudio ? await prepareVideoAudio(sourcePath, audioPath, runner) : undefined;
  const videoTrack = { storageKey: `${keyPrefix}/video.${extension}`, contentHash: await hashFileContent(videoPath), mimeType, sizeBytes: (await stat(videoPath)).size, durationSeconds };
  const audioTrack = audioMetadata ? {
    contentHash: await hashFileContent(audioPath),
    ...audioMetadata, storageKey: `${keyPrefix}/audio.m4a`, mimeType: "audio/mp4", sizeBytes: (await stat(audioPath)).size,
  } : undefined;
  const attempted: string[] = [];
  try {
    for (const [track, path] of [[videoTrack, videoPath], [audioTrack, audioPath]] as const) {
      if (!track) continue;
      attempted.push(track.storageKey);
      await objects.put(track.storageKey, { body: createReadStream(path), contentType: track.mimeType, contentLength: track.sizeBytes });
    }
    return { videoTrack, ...(audioTrack ? { audioTrack } : {}) };
  } catch (error) {
    await Promise.allSettled(attempted.map((key) => objects.delete(key)));
    throw new ObjectStorageError("could not store video tracks", 503, { cause: error });
  }
}
