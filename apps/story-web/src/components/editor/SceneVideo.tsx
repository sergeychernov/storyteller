import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { VideoMaterial } from "../../api.js";
import { CroppedVideo } from "./CroppedVideo.js";
import type { SceneMediaHandle, SceneMediaProps } from "./SceneMedia.js";
import { SceneMediaControls } from "./SceneMediaControls.js";
import { sceneMediaPlaybackDuration } from "./scene-media-time.js";
import type { SceneResourceState } from "./scene-resource-model.js";
import { useMaterialContentUrl } from "./use-material-content-url.js";
import { useSceneMediaTrack } from "./use-scene-media-track.js";

export const SceneVideo = forwardRef<SceneMediaHandle, SceneMediaProps & {
  readonly material: VideoMaterial;
  readonly url: string;
}>(function SceneVideo(props, ref) {
  const [editorMuted, setEditorMuted] = useState(true);
  const loop = props.slot.endBehavior === "loop";
  const hasEditorControls = Boolean(props.controlsCopy);
  const muted = hasEditorControls ? editorMuted : props.muted;
  const hasProcessedAudio = props.slot.audioEnabled && Boolean(props.material.audioTrack);
  const playbackEnded = !loop && props.localTimeSeconds >= sceneMediaPlaybackDuration(props.material);
  const shouldPlayVisual = props.active && props.playing && !playbackEnded;
  const shouldPlayAudio = shouldPlayVisual && !muted;
  const visualResourceId = `${props.slot.id}:visual`;
  const audioResourceId = `${props.slot.id}:audio`;
  const report = (resourceId: string, state: SceneResourceState) => props.onResourceState({ resourceId, state });
  const audioContent = useMaterialContentUrl({
    storyId: props.storyId,
    material: props.material,
    session: props.session,
    audio: hasProcessedAudio,
    enabled: hasProcessedAudio,
    lifecycle: "owned",
    retryKey: props.retryKey,
  });
  const visual = useSceneMediaTrack<HTMLVideoElement>({
    sourceKey: props.url,
    enabled: true,
    material: props.material,
    loop,
    localTimeSeconds: props.localTimeSeconds,
    shouldPlay: shouldPlayVisual,
    active: props.active,
    playbackEnded,
    reportWaiting: true,
    resourceId: visualResourceId,
    onResourceState: props.onResourceState,
    onUnexpectedPause: props.onUnexpectedPause,
  });
  const audio = useSceneMediaTrack<HTMLAudioElement>({
    sourceKey: audioContent.url,
    enabled: hasProcessedAudio && Boolean(audioContent.url),
    material: props.material,
    loop,
    localTimeSeconds: props.localTimeSeconds,
    shouldPlay: shouldPlayAudio,
    active: props.active,
    playbackEnded,
    reportWaiting: !muted,
    resourceId: audioResourceId,
    onResourceState: props.onResourceState,
    onUnexpectedPause: props.onUnexpectedPause,
  });

  useEffect(() => {
    if (hasProcessedAudio && audioContent.failed) report(audioResourceId, "failed");
  }, [audioContent.failed, audioResourceId, hasProcessedAudio, props.onResourceState]);

  const playFromGesture = (localTimeSeconds: number) => {
    if (!props.active || !props.slot.audioEnabled || playbackEnded) return;
    if (hasProcessedAudio && audio.mediaRef.current) {
      audio.mediaRef.current.muted = false;
      audio.playFromGesture(localTimeSeconds);
    } else if (visual.mediaRef.current) {
      visual.mediaRef.current.muted = false;
      visual.playFromGesture(localTimeSeconds);
    }
  };
  useImperativeHandle(ref, () => ({ playAudibleFromGesture: playFromGesture }), [
    hasProcessedAudio, playbackEnded, props.active, props.slot.audioEnabled,
  ]);

  return <>
    <CroppedVideo
      material={props.material}
      videoRef={visual.mediaRef}
      src={props.url}
      muted={hasProcessedAudio || muted || !props.slot.audioEnabled || !props.active}
      playsInline
      preload={props.preload}
      aria-label={props.material.name}
      data-scene-native-audio={!hasProcessedAudio && props.slot.audioEnabled ? "true" : undefined}
      {...visual.events}
    />
    {hasProcessedAudio && <audio
      ref={audio.mediaRef}
      src={audioContent.url}
      data-scene-processed-audio="true"
      muted={muted || !props.active}
      preload={props.preload}
      {...audio.events}
    />}
    {hasEditorControls && props.active && <SceneMediaControls
      copy={props.controlsCopy!}
      playing={props.playing}
      muted={muted}
      hasAudio={props.material.hasAudio && props.slot.audioEnabled}
      onPlay={() => {
        visual.playFromGesture(props.localTimeSeconds);
        if (!muted) playFromGesture(props.localTimeSeconds);
      }}
      onTogglePlayback={() => props.onTogglePlayback?.()}
      onToggleMuted={() => {
        const enabling = muted;
        setEditorMuted(!editorMuted);
        if (enabling && props.playing) playFromGesture(props.localTimeSeconds);
      }}
    />}
  </>;
});
