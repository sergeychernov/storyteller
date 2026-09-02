import { useEffect } from "react";
import type { AuthSession } from "../../api.js";
import { classNames } from "../../class-names.js";
import { SceneFrameCollageBackground } from "./SceneFrameRenderer.js";
import { SceneMedia } from "./SceneMedia.js";
import mediaStyles from "./MaterialThumbnail.module.css";
import type { ScenePlaybackBackground } from "./scene-playback-plan.js";
import type { SceneResourceEvent } from "./scene-resource-model.js";
import { useSceneFrameUrl } from "./use-scene-frame-url.js";

interface ScenePlayerBackgroundProps {
  readonly background: ScenePlaybackBackground;
  readonly sceneId: string;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly localTimeSeconds: number;
  readonly playing: boolean;
  readonly active: boolean;
  readonly preload: "auto" | "metadata";
  readonly retryKey: number;
  readonly onResourceState: (event: SceneResourceEvent) => void;
  readonly onUnexpectedPause?: (() => void) | undefined;
}

export function ScenePlayerBackground(props: ScenePlayerBackgroundProps) {
  const background = props.background;
  if (background.kind === "previous-scene-frame") return <PreviousSceneFrameBackground
    {...props}
    background={background}
  />;
  return <SceneFrameCollageBackground treated={background.treated} mode={background.mode}>
    <SceneMedia
      storyId={props.storyId}
      session={props.session}
      slot={background.slot}
      localTimeSeconds={props.localTimeSeconds}
      playing={props.playing}
      active={props.active}
      muted
      preload={props.preload}
      retryKey={props.retryKey}
      onResourceState={props.onResourceState}
      onUnexpectedPause={() => props.onUnexpectedPause?.()}
    />
  </SceneFrameCollageBackground>;
}

function PreviousSceneFrameBackground(props: ScenePlayerBackgroundProps & {
  readonly background: Extract<ScenePlaybackBackground, { readonly kind: "previous-scene-frame" }>;
}) {
  const frame = useSceneFrameUrl(props.background.scene, props.storyId, props.session);
  const resourceId = `${props.sceneId}:previous-scene-frame`;
  // The fallback fulfills the same logical background slot until the rendered frame replaces it.
  const reportFallbackAsPreviousFrame = (event: SceneResourceEvent) => {
    props.onResourceState({ resourceId, state: event.state });
  };
  useEffect(() => {
    if (frame.failed && !props.background.fallback) props.onResourceState({ resourceId, state: "failed" });
  }, [frame.failed, props.background.fallback, props.onResourceState, resourceId]);
  return <SceneFrameCollageBackground treated mode="previous-scene">
    {frame.url
      ? <img src={frame.url} alt="" draggable={false}
        onLoad={() => props.onResourceState({ resourceId, state: "ready" })}
        onError={() => props.onResourceState({ resourceId, state: props.background.fallback ? "waiting" : "failed" })} />
      : props.background.fallback
        ? <SceneMedia
          storyId={props.storyId}
          session={props.session}
          slot={props.background.fallback}
          localTimeSeconds={0}
          playing={false}
          active={props.active}
          muted
          preload={props.preload}
          retryKey={props.retryKey}
          onResourceState={reportFallbackAsPreviousFrame}
          onUnexpectedPause={() => undefined}
        />
        : <span className={classNames(mediaStyles.placeholder, mediaStyles.preview)} aria-hidden="true">◫</span>}
  </SceneFrameCollageBackground>;
}
