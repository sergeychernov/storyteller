import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthSession, Story, StoryTimeline } from "../../api.js";
import { prefersMetadataFirstPreload, useMaterialContentUrl } from "../editor/use-material-content-url.js";
import { useSceneFrameUrl } from "../editor/use-scene-frame-url.js";
import type { StoryPreviewSnapshot } from "./story-preview-machine.js";
import { previewPreloadPlan, type PreviewPreloadResource } from "./preview-preload-plan.js";
import { warmPreviewMedia } from "./preview-media-warmup.js";

export function PreviewMediaPreloader({ story, timeline, session, snapshot }: {
  readonly story: Story; readonly timeline: StoryTimeline; readonly session: AuthSession; readonly snapshot: StoryPreviewSnapshot;
}) {
  const current = snapshot.pendingTimelineIndex ?? snapshot.currentTimelineIndex;
  const resources = useMemo(() => current === undefined ? []
    : previewPreloadPlan(story, timeline, current, prefersMetadataFirstPreload()), [story, timeline, current]);
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const mark = useCallback((id: string) => setSettled((previous) => previous.has(id) ? previous : new Set([...previous, id])), []);
  // Retain URL observers for visible slots too, so promotion uses the same signed URL/cache entry.
  const running = resources.filter(({ warm, id }) => warm && !settled.has(id)).slice(0, 2);
  const active = resources.filter((resource) => !resource.warm || settled.has(resource.id) || running.includes(resource));
  useEffect(() => {
    const ids = new Set(resources.map(({ id }) => id));
    setSettled((previous) => new Set([...previous].filter((id) => ids.has(id))));
  }, [resources]);
  return <>{active.map((resource) => "frame" in resource
    ? <FramePreload key={resource.id} resource={resource} storyId={story.id} session={session} settled={mark} />
    : <MaterialPreload key={resource.id} resource={resource} storyId={story.id} session={session} settled={mark} />)}</>;
}

type PreloadProps = { readonly storyId: string; readonly session: AuthSession; readonly settled: (id: string) => void };
function MaterialPreload({ resource, storyId, session, settled }: PreloadProps & {
  readonly resource: Extract<PreviewPreloadResource, { material: unknown }>;
}) {
  const content = useMaterialContentUrl({ storyId, session, material: resource.material, audio: resource.audio });
  useWarmup(resource.id, resource.warm, content.url, content.failed, resource.audio ? "audio" : resource.material.kind,
    resource.material.kind === "video" ? resource.material.edit?.trim?.startSeconds ?? 0 : 0, settled);
  return null;
}
function FramePreload({ resource, storyId, session, settled }: PreloadProps & {
  readonly resource: Extract<PreviewPreloadResource, { frame: unknown }>;
}) {
  const content = useSceneFrameUrl(resource.frame, storyId, session);
  useWarmup(resource.id, resource.warm, content.url, content.failed || !content.supported, "image", 0, settled);
  return null;
}
function useWarmup(id: string, warm: boolean, url: string | undefined, failed: boolean, kind: "image" | "video" | "audio",
  start: number, settled: (id: string) => void) {
  useEffect(() => {
    if (!warm) return;
    if (failed) { settled(id); return; }
    if (url) return warmPreviewMedia(url, kind, start, () => settled(id));
  }, [failed, id, kind, settled, start, url, warm]);
}
