import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AuthSession, Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import { SceneCanvas } from "./SceneCanvas.js";
import { SceneEdgeActions } from "./SceneEdgeActions.js";
import { buildSceneCarouselSlots, sceneCarouselKey, type SceneCarouselSlot } from "./scene-carousel-model.js";
import styles from "./SceneCarousel.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface SceneCarouselProps {
  readonly scenes: readonly Scene[];
  readonly selectedId: string;
  readonly copy: EditorCopy;
  readonly storyId: string;
  readonly session: AuthSession;
  readonly adding: boolean;
  readonly saving: boolean;
  readonly onSelect: (id: string) => void;
  readonly onAdd: () => void;
  readonly onChange: (change: SceneChange) => void;
}

const emptyKey = "edge:empty";

export function SceneCarousel({ scenes, selectedId, copy, storyId, session, adding, saving, onSelect, onAdd, onChange }: SceneCarouselProps) {
  const slots = useMemo(() => buildSceneCarouselSlots(scenes), [scenes]);
  const viewport = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | undefined>(undefined);
  const animationFrame = useRef<number | undefined>(undefined);
  const [activeKey, setActiveKey] = useState(selectedId ? sceneCarouselKey(selectedId) : slots[0]?.key ?? emptyKey);

  function findClosestSlot(): SceneCarouselSlot<Scene> | undefined {
    const element = viewport.current;
    if (!element) return undefined;
    const center = element.scrollLeft + element.clientWidth / 2;
    let closest: { slot: SceneCarouselSlot<Scene>; distance: number } | undefined;
    for (const child of element.children) {
      if (!(child instanceof HTMLElement)) continue;
      const key = child.dataset.carouselKey;
      const slot = slots.find((candidate) => candidate.key === key);
      if (!slot) continue;
      const distance = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
      if (!closest || distance < closest.distance) closest = { slot, distance };
    }
    return closest?.slot;
  }

  function updateClosestSlot(commit: boolean) {
    const closest = findClosestSlot();
    if (!closest) return;
    setActiveKey(closest.key);
    if (commit && closest.kind === "scene" && closest.scene.id !== selectedId) onSelect(closest.scene.id);
  }

  function handleScroll() {
    if (animationFrame.current === undefined) {
      animationFrame.current = window.requestAnimationFrame(() => {
        animationFrame.current = undefined;
        updateClosestSlot(false);
      });
    }
    if (scrollTimer.current !== undefined) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => updateClosestSlot(true), 140);
  }

  function scrollToSlot(key: string, behavior: ScrollBehavior) {
    const element = viewport.current;
    if (!element) return;
    const target = [...element.children].find((child) => child instanceof HTMLElement && child.dataset.carouselKey === key);
    if (!(target instanceof HTMLElement)) return;
    element.scrollTo({ left: target.offsetLeft - (element.clientWidth - target.offsetWidth) / 2, behavior });
  }

  useLayoutEffect(() => {
    const key = selectedId ? sceneCarouselKey(selectedId) : slots[0]?.key;
    if (!key) return;
    setActiveKey(key);
    scrollToSlot(key, "auto");
  }, [selectedId, slots]);

  useEffect(() => () => {
    if (scrollTimer.current !== undefined) window.clearTimeout(scrollTimer.current);
    if (animationFrame.current !== undefined) window.cancelAnimationFrame(animationFrame.current);
  }, []);

  const activeIndex = Math.max(0, slots.findIndex(({ key }) => key === activeKey));
  return (
    <section className={styles.carousel} aria-label={copy.sceneCarousel}>
      <div
        className={styles.viewport}
        ref={viewport}
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          const slot = slots[Math.max(0, Math.min(slots.length - 1, activeIndex + direction))];
          if (!slot) return;
          setActiveKey(slot.key);
          scrollToSlot(slot.key, "smooth");
          if (slot.kind === "scene" && slot.scene.id !== selectedId) onSelect(slot.scene.id);
        }}
      >
        {slots.map((slot, slotIndex) => {
          const active = slot.key === activeKey;
          const adjacent = slotIndex === activeIndex - 1
            ? "previous"
            : slotIndex === activeIndex + 1
              ? "next"
              : undefined;
          const edgeTitle = slot.kind === "edge"
            ? slot.edge === "before" ? copy.storyStart : slot.edge === "after" ? copy.storyEnd : copy.noScenes
            : "";
          return (
            <article
              className={classNames(styles.slide, active && styles.active, adjacent && styles.adjacent)}
              data-carousel-key={slot.key}
              key={slot.key}
              aria-label={slot.kind === "scene" ? `${copy.scene} ${slot.index + 1}` : undefined}
              aria-current={active ? "true" : undefined}
            >
              {slot.kind === "scene" ? <>
                <div className={classNames(styles.label, adjacent && styles.dimmed)}>
                  <strong>{slot.scene.title || `${copy.scene} ${slot.index + 1}`}</strong>
                  <span>9:16 · {slot.scene.durationSeconds} {copy.seconds}</span>
                </div>
                <SceneCanvas
                  scene={slot.scene}
                  copy={copy}
                  storyId={storyId}
                  session={session}
                  presentation="carousel"
                  adjacent={adjacent}
                  dimmed={Boolean(adjacent)}
                  inactive={!active}
                  saving={saving}
                  onChange={slot.scene.id === selectedId ? onChange : undefined}
                />
              </> : <>
                <div className={classNames(styles.label, adjacent && styles.dimmed)}><strong>{edgeTitle}</strong></div>
                <SceneEdgeActions
                  copy={copy}
                  adding={adding}
                  active={active}
                  onAdd={onAdd}
                  variant={slot.edge === "empty" ? "carouselEmpty" : "default"}
                  adjacent={adjacent}
                  dimmed={Boolean(adjacent)}
                />
              </>}
              {!active && (slotIndex === activeIndex - 1 || slotIndex === activeIndex + 1) && <button
                type="button"
                className={classNames(styles.adjacentTarget, slotIndex < activeIndex ? styles.previous : styles.next)}
                aria-label={slot.kind === "scene" ? `${copy.openScene} ${slot.index + 1}` : edgeTitle}
                onClick={() => {
                  setActiveKey(slot.key);
                  scrollToSlot(slot.key, "smooth");
                  if (slot.kind === "scene") onSelect(slot.scene.id);
                }}
              ><span>{slot.kind === "edge" ? "＋" : slotIndex < activeIndex ? "‹" : "›"}</span></button>}
            </article>
          );
        })}
      </div>
      <p className={styles.swipeHint}>{copy.swipeScenes}</p>
    </section>
  );
}
