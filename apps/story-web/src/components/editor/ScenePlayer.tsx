import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode,
} from "react";
import type { AuthSession, Scene } from "../../api.js";
import { SceneFrameRenderer } from "./SceneFrameRenderer.js";
import { SceneMedia, type SceneMediaHandle } from "./SceneMedia.js";
import { buildScenePlaybackPlan, type ScenePlaybackSlot } from "./scene-playback-plan.js";
import { ScenePlayerBackground } from "./ScenePlayerBackground.js";
import {
  aggregateSceneResources, createSceneResourceRegistry, updateSceneResourceRegistry,
  type SceneResourceEvent,
} from "./scene-resource-model.js";
import type { EditorCopy } from "./editor-copy.js";

export interface ScenePlayerHandle {
  readonly playAudibleFromGesture: () => void;
}

export interface ScenePlayerProps {
  readonly scene: Scene;
  readonly previousScene?: Scene | undefined;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly localTimeSeconds: number;
  readonly playing: boolean;
  readonly active: boolean;
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  readonly preload: "auto" | "metadata";
  readonly retryKey: number;
  readonly editorMediaControls?: { readonly onTogglePlayback: () => void } | undefined;
  readonly renderSlotOverlay?: ((slot: ScenePlaybackSlot) => ReactNode) | undefined;
  readonly onReady?: (() => void) | undefined;
  readonly onWaiting?: (() => void) | undefined;
  readonly onFailed?: (() => void) | undefined;
  readonly onUnexpectedPause?: (() => void) | undefined;
}

/** Shared scene executor. Callers provide a clock; plan, media, readiness and background semantics stay identical. */
export const ScenePlayer = forwardRef<ScenePlayerHandle, ScenePlayerProps>(function ScenePlayer(props, ref) {
  const plan = useMemo(
    () => buildScenePlaybackPlan(props.scene, props.previousScene),
    [props.previousScene, props.scene],
  );
  return <ScenePlayerBody {...props} key={`${props.retryKey}:${plan.identity}`} ref={ref} plan={plan} />;
});

const ScenePlayerBody = forwardRef<ScenePlayerHandle, ScenePlayerProps & {
  readonly plan: ReturnType<typeof buildScenePlaybackPlan>;
}>(function ScenePlayerBody(props, ref) {
  const [registry, setRegistry] = useState(() => createSceneResourceRegistry(props.plan.requiredResourceIds));
  const media = useRef(new Map<string, SceneMediaHandle>());
  const aggregate = aggregateSceneResources(registry);
  const lastReported = useRef<typeof aggregate | undefined>(undefined);
  const onResourceState = useCallback((event: SceneResourceEvent) => {
    setRegistry((current) => updateSceneResourceRegistry(current, event));
  }, []);

  useEffect(() => {
    if (aggregate === lastReported.current) return;
    lastReported.current = aggregate;
    if (aggregate === "ready") props.onReady?.();
    else if (aggregate === "waiting") props.onWaiting?.();
    else if (aggregate === "failed") props.onFailed?.();
  }, [aggregate, props.onFailed, props.onReady, props.onWaiting]);

  useImperativeHandle(ref, () => ({
    playAudibleFromGesture() {
      for (const handle of media.current.values()) handle.playAudibleFromGesture(props.localTimeSeconds);
    },
  }), [props.localTimeSeconds]);

  const renderMaterial = (slot: ScenePlaybackSlot) => <>
    <SceneMedia
      ref={(handle) => {
        if (handle) media.current.set(slot.id, handle);
        else media.current.delete(slot.id);
      }}
      storyId={props.storyId}
      session={props.session}
      slot={slot}
      localTimeSeconds={props.localTimeSeconds}
      playing={props.playing}
      active={props.active}
      muted={props.muted}
      preload={props.preload}
      retryKey={props.retryKey}
      controlsCopy={props.editorMediaControls && slot.role === "layout" ? props.copy : undefined}
      onTogglePlayback={props.editorMediaControls?.onTogglePlayback}
      onResourceState={onResourceState}
      onUnexpectedPause={() => props.onUnexpectedPause?.()}
    />
    {props.renderSlotOverlay?.(slot)}
  </>;
  const background = props.plan.background
    ? <ScenePlayerBackground
      background={props.plan.background}
      sceneId={props.scene.id}
      storyId={props.storyId}
      session={props.session}
      localTimeSeconds={props.localTimeSeconds}
      playing={props.playing}
      active={props.active}
      preload={props.preload}
      retryKey={props.retryKey}
      onResourceState={onResourceState}
      onUnexpectedPause={props.onUnexpectedPause}
    />
    : undefined;

  return <SceneFrameRenderer
    plan={props.plan}
    copy={props.copy}
    localTimeSeconds={props.localTimeSeconds}
    reducedMotion={props.reducedMotion}
    renderMaterial={renderMaterial}
    collageBackground={background}
    onUnavailable={props.onFailed}
  />;
});
