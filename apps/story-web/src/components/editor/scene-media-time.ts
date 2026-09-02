import type { VideoMaterial } from "../../api.js";

export function sceneMediaSourceTime(material: VideoMaterial, localTimeSeconds: number, loop: boolean): number {
  const start = material.edit?.trim?.startSeconds ?? 0;
  const end = material.edit?.trim?.endSeconds ?? material.sourceDurationSeconds;
  const duration = Math.max(0.001, end - start);
  if (!loop && localTimeSeconds >= duration) return Math.max(start, end - 0.001);
  const local = loop ? localTimeSeconds % duration : Math.min(duration, localTimeSeconds);
  return Math.min(end, start + Math.max(0, local));
}

export function sceneMediaPlaybackDuration(material: VideoMaterial): number {
  const start = material.edit?.trim?.startSeconds ?? 0;
  const end = material.edit?.trim?.endSeconds ?? material.sourceDurationSeconds;
  return Math.max(0, end - start);
}

export function isSceneMediaAtSourceEnd(material: VideoMaterial, currentTime: number | undefined): boolean {
  if (currentTime === undefined) return false;
  const end = material.edit?.trim?.endSeconds ?? material.sourceDurationSeconds;
  return currentTime >= end - 0.08;
}

export function shouldSceneMediaReportWaiting(
  active: boolean,
  playbackEnded: boolean,
  material: VideoMaterial,
  media: HTMLMediaElement,
): boolean {
  return active && !playbackEnded && media.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
    && !isSceneMediaAtSourceEnd(material, media.currentTime);
}
