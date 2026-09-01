import { useRef } from "react";
import type { AuthSession, Scene, StoryTimeline } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { formatSceneDuration } from "./scene-duration-model.js";
import sharedStyles from "./editor-shared.module.css";
import styles from "./SceneRail.module.css";
import { SceneFrameImage } from "./SceneFrameImage.js";
import { SceneDragGhost } from "./SceneDragGhost.js";
import { useSceneDrag } from "./use-scene-drag.js";
import { useMaterialSceneDrag } from "./MaterialSceneDragContext.js";
import { TimelineSummary } from "./TimelineSummary.js";

export interface SceneRailProps {
  readonly scenes: readonly Scene[];
  readonly storyId?: string;
  readonly session?: AuthSession;
  readonly selectedId: string;
  readonly copy: EditorCopy;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
  readonly adding: boolean;
  readonly saving?: boolean;
  readonly onReorder?: (ids: readonly string[]) => void;
  readonly variant?: "default" | "desktop" | "mobileTimeline";
  readonly timeline?: StoryTimeline | undefined;
  readonly timelineLoading?: boolean;
  readonly timelineError?: boolean;
  readonly onRetryTimeline?: () => void;
}

export function SceneRail({
  scenes, storyId, session, selectedId, copy, onSelect, onAdd, onReorder, adding, saving = false, variant = "default",
  timeline, timelineLoading = false, timelineError = false, onRetryTimeline = () => undefined,
}: SceneRailProps) {
  const railRef = useRef<HTMLElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const materialDrag = useMaterialSceneDrag();
  const reorderDisabled = saving || !onReorder || scenes.length < 2;
  const drag = useSceneDrag({
    scenes,
    disabled: reorderDisabled,
    scrollRef: variant === "mobileTimeline" ? railRef : listScrollRef,
    onReorder: (ids) => onReorder?.(ids),
  });
  return (
    <aside
      ref={railRef}
      {...(variant === "mobileTimeline" ? { "data-scene-drop-scroll": "true" } : {})}
      className={classNames(styles.rail, variant === "desktop" && styles.desktop, variant === "mobileTimeline" && styles.mobileTimeline)}
      aria-label={variant === "mobileTimeline" ? copy.timeline : undefined}
    >
      <div className={styles.sectionHead}><h2>{copy.scenes}</h2><span>{scenes.length}</span></div>
      {(variant === "desktop" || variant === "mobileTimeline") && <TimelineSummary
        timeline={timeline}
        loading={timelineLoading}
        error={timelineError}
        copy={copy}
        onRetry={onRetryTimeline}
      />}
      <div
        className={styles.list}
        {...(variant !== "mobileTimeline" ? { "data-scene-drop-scroll": "true" } : {})}
        ref={(node) => { drag.listRef.current = node; listScrollRef.current = node; }}
      >
        {drag.orderedScenes.map((scene, index) => {
          const emptyTimelineScene = timeline?.warnings.some((warning) => warning.sceneId === scene.id) === true;
          const materialDropCandidate = !!materialDrag.state && materialDrag.state.sourceSceneId !== scene.id;
          const materialDropTarget = materialDropCandidate && materialDrag.state?.targetSceneId === scene.id;
          return (
          <div
            className={classNames(
              styles.sceneRow,
              scene.id === selectedId && styles.activeRow,
              drag.draggingId === scene.id && styles.dragging,
              materialDropCandidate && styles.materialDropCandidate,
              materialDropTarget && styles.materialDropTarget,
            )}
            data-scene-id={scene.id}
            data-scene-drop-id={scene.id}
            key={scene.id}
          >
            <button
              type="button"
              className={classNames(styles.tab, scene.id === selectedId && styles.active)}
              aria-current={scene.id === selectedId ? "true" : undefined}
              onClick={() => onSelect(scene.id)}
            >
              <span className={styles.thumbnail}>
                {storyId && session && <SceneFrameImage scene={scene} storyId={storyId} session={session} presentation="timeline" />}
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                {emptyTimelineScene && <span className={styles.emptyMarker} aria-hidden="true">!</span>}
              </span>
              <span><strong>{scene.title || `${copy.scene} ${index + 1}`}</strong><small className={emptyTimelineScene ? styles.emptyLabel : undefined}>
                {emptyTimelineScene ? copy.timelineEmptySceneLabel : `${formatSceneDuration(scene)} ${copy.seconds} · ${scene.materials.length}`}
              </small></span>
            </button>
            <button
              type="button"
              className={styles.dragHandle}
              disabled={reorderDisabled}
              aria-label={copy.dragScene.replace("{{number}}", String(index + 1))}
              title={copy.dragSceneHint}
              onPointerDown={(event) => drag.startDrag(event, scene)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                drag.moveWithKeyboard(scene.id, event.key === "ArrowUp" ? -1 : 1);
              }}
            ><span aria-hidden="true">{materialDropCandidate ? materialDropTarget ? "↓" : "+" : "⠿"}</span></button>
          </div>
          );
        })}
      </div>
      <button type="button" className={classNames(sharedStyles.secondaryButton, styles.addButton, adding && sharedStyles.loading)} disabled={adding} onClick={onAdd}>{adding ? copy.creatingScene : `＋ ${copy.addScene}`}</button>
      {drag.dragVisual && <SceneDragGhost
        {...drag.dragVisual}
        {...(storyId ? { storyId } : {})}
        {...(session ? { session } : {})}
        copy={copy}
      />}
    </aside>
  );
}
