import { useEffect, useLayoutEffect, useRef } from "react";
import type { AuthSession, SceneMaterial, VideoMaterial } from "../../api.js";
import { CroppedVideo } from "../editor/CroppedVideo.js";
import type { StoryPreviewStatus } from "./use-story-preview-controller.js";
import { usePreviewResourceUrl } from "./use-preview-resource-url.js";
import { createMediaRendererLifecycle, type PreviewRendererLifecycle } from "./preview-renderer-lifecycle.js";
import styles from "./StoryPreview.module.css";

interface PreviewMaterialProps {
  readonly storyId: string;
  readonly session: AuthSession;
  readonly material: SceneMaterial;
  readonly localTimeSeconds: number;
  readonly sceneDurationSeconds: number;
  readonly status: StoryPreviewStatus;
  readonly active: boolean;
  readonly muted: boolean;
  readonly audioEnabled: boolean;
  readonly loopVideo: boolean;
  readonly preload: "auto" | "metadata";
  readonly retryKey: number;
  readonly onReady: () => void;
  readonly onWaiting: () => void;
  readonly onFailed: () => void;
  readonly onUnexpectedPause: () => void;
}

export function PreviewMaterial(props: PreviewMaterialProps) {
  const content = usePreviewResourceUrl({
    storyId: props.storyId, material: props.material, session: props.session, retryKey: props.retryKey,
  });
  useEffect(() => { if (content.failed) props.onFailed(); }, [content.failed, props.onFailed]);
  if (!content.url) return <span className={styles.mediaPlaceholder} aria-hidden="true">{props.material.kind === "video" ? "▶" : "◫"}</span>;
  return props.material.kind === "video"
    ? <PreviewVideo {...props} material={props.material} url={content.url} />
    : <img className={styles.media} src={content.url} alt="" draggable={false} onLoad={props.onReady} onError={props.onFailed} />;
}

function PreviewVideo(props: PreviewMaterialProps & { readonly material: VideoMaterial; readonly url: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const videoLifecycle = useRef<PreviewRendererLifecycle>(null);
  const audioLifecycle = useRef<PreviewRendererLifecycle>(null);
  const programmaticPause = useRef(false);
  const videoDisposing = useRef(false);
  const audioDisposing = useRef(false);
  const readiness = useRef({ video: false, audio: !props.material.audioTrack });
  const audioContent = usePreviewResourceUrl({
    storyId: props.storyId, material: props.material, session: props.session,
    audio: Boolean(props.material.audioTrack), retryKey: props.retryKey,
  });
  const targetTime = sourceTime(props.material, props.localTimeSeconds, props.loopVideo);
  const playbackEnded = !props.loopVideo && props.localTimeSeconds >= playbackDuration(props.material);
  const markReady = (kind: "video" | "audio") => {
    readiness.current[kind] = true;
    if (readiness.current.video && readiness.current.audio) props.onReady();
  };

  useEffect(() => {
    if (audioContent.failed && props.audioEnabled) props.onFailed();
  }, [audioContent.failed, props.audioEnabled, props.onFailed]);

  useLayoutEffect(() => {
    const element = video.current;
    if (!element) return;
    videoDisposing.current = false;
    const lifecycle = createMediaRendererLifecycle(element, (localTime) => sourceTime(props.material, localTime, props.loopVideo));
    videoLifecycle.current = lifecycle;
    return () => {
      videoDisposing.current = true;
      programmaticPause.current = true;
      lifecycle.dispose();
      if (videoLifecycle.current === lifecycle) videoLifecycle.current = null;
    };
  }, [props.loopVideo, props.material, props.url]);

  useLayoutEffect(() => {
    const element = audio.current;
    if (!element || !audioContent.url) return;
    audioDisposing.current = false;
    const lifecycle = createMediaRendererLifecycle(element, (localTime) => sourceTime(props.material, localTime, props.loopVideo));
    audioLifecycle.current = lifecycle;
    return () => {
      audioDisposing.current = true;
      lifecycle.dispose();
      if (audioLifecycle.current === lifecycle) audioLifecycle.current = null;
    };
  }, [audioContent.url, props.loopVideo, props.material]);

  useEffect(() => {
    const lifecycle = videoLifecycle.current;
    if (!lifecycle) return;
    if (!props.active) {
      if (video.current && !video.current.paused) programmaticPause.current = true;
      lifecycle.pause();
      lifecycle.seek(props.localTimeSeconds);
      return;
    }
    if (props.status === "playing" && !playbackEnded) {
      void lifecycle.play(props.localTimeSeconds).catch(props.onFailed);
    } else {
      if (video.current && !video.current.paused) programmaticPause.current = true;
      lifecycle.pause();
      lifecycle.seek(props.localTimeSeconds);
    }
  }, [playbackEnded, props.active, props.localTimeSeconds, props.onFailed, props.status]);

  useEffect(() => {
    const lifecycle = audioLifecycle.current;
    if (!lifecycle) return;
    if (!props.active) {
      lifecycle.pause();
      lifecycle.seek(props.localTimeSeconds);
      return;
    }
    if (props.status === "playing" && !playbackEnded && props.audioEnabled && !props.muted) {
      void lifecycle.play(props.localTimeSeconds).catch(() => undefined);
    } else {
      lifecycle.pause();
      lifecycle.seek(props.localTimeSeconds);
    }
  }, [playbackEnded, props.active, props.audioEnabled, props.localTimeSeconds, props.muted, props.status]);

  return <>
    <CroppedVideo
      material={props.material}
      videoRef={video}
      src={props.url}
      muted={Boolean(props.material.audioTrack) || props.muted || !props.audioEnabled || !props.active}
      playsInline
      preload={props.preload}
      aria-label={props.material.name}
      data-preview-native-audio={!props.material.audioTrack && props.audioEnabled ? "true" : undefined}
      data-preview-audio-enabled={props.audioEnabled ? "true" : undefined}
      onLoadedMetadata={(event) => {
        event.currentTarget.currentTime = targetTime;
        void videoLifecycle.current?.prepare(props.localTimeSeconds).catch(props.onFailed);
      }}
      onCanPlay={() => markReady("video")}
      onWaiting={() => { if (props.active) props.onWaiting(); }}
      onStalled={() => { if (props.active) props.onWaiting(); }}
      onError={props.onFailed}
      onPause={() => {
        if (programmaticPause.current || videoDisposing.current) programmaticPause.current = false;
        else if (props.active && props.status === "playing" && !isAtSourceEnd(props.material, video.current?.currentTime)) {
          props.onUnexpectedPause();
        }
      }}
    />
    {props.material.audioTrack && <audio
      ref={audio}
      src={audioContent.url}
      data-preview-processed-audio="true"
      data-preview-audio-enabled={props.audioEnabled ? "true" : undefined}
      muted={props.muted || !props.audioEnabled || !props.active}
      preload={props.preload}
      onLoadedMetadata={() => { void audioLifecycle.current?.prepare(props.localTimeSeconds).catch(props.onFailed); }}
      onCanPlay={() => markReady("audio")}
      onWaiting={() => { if (props.active && !props.muted) props.onWaiting(); }}
      onStalled={() => { if (props.active && !props.muted) props.onWaiting(); }}
      onError={props.onFailed}
      onPause={() => {
        if (!audioDisposing.current && props.active && props.status === "playing" && props.audioEnabled && !props.muted
          && !isAtSourceEnd(props.material, audio.current?.currentTime)) props.onUnexpectedPause();
      }}
    />}
  </>;
}

function sourceTime(material: VideoMaterial, localTimeSeconds: number, loop: boolean): number {
  const start = material.edit?.trim?.startSeconds ?? 0;
  const end = material.edit?.trim?.endSeconds ?? material.sourceDurationSeconds;
  const duration = Math.max(0.001, end - start);
  if (!loop && localTimeSeconds >= duration) return Math.max(start, end - 0.001);
  const local = loop ? localTimeSeconds % duration : Math.min(duration, localTimeSeconds);
  return Math.min(end, start + Math.max(0, local));
}

function playbackDuration(material: VideoMaterial): number {
  const start = material.edit?.trim?.startSeconds ?? 0;
  const end = material.edit?.trim?.endSeconds ?? material.sourceDurationSeconds;
  return Math.max(0, end - start);
}

function isAtSourceEnd(material: VideoMaterial, currentTime: number | undefined): boolean {
  if (currentTime === undefined) return false;
  const end = material.edit?.trim?.endSeconds ?? material.sourceDurationSeconds;
  return currentTime >= end - 0.08;
}
