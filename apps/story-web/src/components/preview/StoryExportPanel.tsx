import { analytics } from "@storyteller/analytics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalization } from "@storyteller/web-ui";
import { useCapability } from "../../access-control.js";
import {
  ApiError, getCurrentStoryExport, requestStoryExport, storyExportContentUrl, type AuthSession, type Story, type StoryExport,
} from "../../api.js";
import { getPreviewCopy, interpolatePreviewCopy } from "./preview-copy.js";
import styles from "./StoryExportPanel.module.css";

export function StoryExportPanel({ story, session }: { readonly story: Story; readonly session: AuthSession }) {
  const { locale } = useLocalization();
  const copy = getPreviewCopy(locale);
  const canExport = useCapability("story.export");
  const queryClient = useQueryClient();
  const exportQuery = useQuery({
    queryKey: ["story-export", session.profile.id, story.id],
    queryFn: ({ signal }) => getCurrentStoryExport(session.csrfToken, story.id, signal),
    enabled: canExport,
    refetchInterval: (query) => query.state.data && ["queued", "rendering", "assembling"].includes(query.state.data.status) ? 1_000 : false,
  });
  const requestExport = useMutation({
    mutationFn: () => requestStoryExport(session.csrfToken, story.id, story.revision),
    onSuccess: (value) => queryClient.setQueryData(["story-export", session.profile.id, story.id], value),
  });
  if (!canExport) return null;
  const value = exportQuery.data;
  const active = value && ["queued", "rendering", "assembling"].includes(value.status);
  const stale = value && (value.status === "canceled" || value.storyRevision !== story.revision);
  const error = requestExport.error ?? exportQuery.error;
  const errorText = error instanceof ApiError ? exportErrorText(error.code, copy) : error ? copy.exportUnknownError : undefined;
  const canDownload = value?.status === "ready" && value.storyRevision === story.revision;
  const frameRate = value ? value.frameRate.numerator / value.frameRate.denominator : undefined;

  return <section className={styles.panel} aria-labelledby="story-export-title">
    <div className={styles.heading}>
      <div><strong id="story-export-title">{copy.exportTitle}</strong><small>{copy.exportProfile}</small></div>
      {value && <span>{value.progressPercent}%</span>}
    </div>
    {value && <progress max={100} value={value.progressPercent} aria-label={copy.exportProgress} />}
    <p role={errorText || value?.status === "failed" ? "alert" : "status"} aria-live="polite">
      {errorText ?? exportStatus(value, stale, frameRate, copy)}
    </p>
    <div className={styles.actions}>
      {!canDownload && <button type="button" disabled={Boolean(active) || requestExport.isPending} onClick={() => requestExport.mutate()}>
        {value?.status === "failed" || stale || error ? copy.exportRetry : copy.exportStart}
      </button>}
      {canDownload && <a href={storyExportContentUrl(story.id, value.id)} onClick={() => {
        analytics.track("story exported", { output_profile: "vertical_social" });
      }}>{copy.exportDownload}</a>}
    </div>
  </section>;
}

function exportStatus(
  value: StoryExport | null | undefined,
  stale: boolean | null | undefined,
  frameRate: number | undefined,
  copy: ReturnType<typeof getPreviewCopy>,
): string {
  if (!value) return copy.exportReadyToStart;
  if (stale) return copy.exportStale;
  if (value.status === "failed") return exportErrorText(value.errorCode, copy);
  if (value.status === "ready") return interpolatePreviewCopy(copy.exportReady, {
    fps: frameRate?.toFixed(3).replace(/\.?0+$/, "") ?? "30",
  });
  if (value.progressPhase === "assembling" || value.progressPhase === "uploading") return copy.exportAssembling;
  return interpolatePreviewCopy(copy.exportRendering, { ready: value.readySegments, total: value.totalSegments });
}

function exportErrorText(code: string | undefined, copy: ReturnType<typeof getPreviewCopy>): string {
  if (code === "story_export_approved_mix_required") return copy.exportMixRequired;
  if (code === "story_export_approved_mix_stale" || code === "approved_mix_mismatch") return copy.exportMixStale;
  if (code === "story_export_empty_scene" || code === "story_export_empty_story") return copy.exportEmptyScene;
  if (code === "story_revision_conflict" || code === "story_revision_changed") return copy.exportStale;
  if (code === "segment_failed" || code === "segment_profile_mismatch") return copy.exportSegmentFailed;
  return copy.exportUnknownError;
}
