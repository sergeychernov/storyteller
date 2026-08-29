import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Scene } from "../../api.js";
import { hasSceneOrderChanged, mergeSceneOrder, moveScene } from "./scene-order-model.js";
import { lockPageScroll, unlockPageScroll } from "./pointer-drag-page-lock.js";

export interface SceneDragVisual {
  readonly scene: Scene;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly dropping: boolean;
}

interface DragListeners {
  readonly move: (event: PointerEvent) => void;
  readonly finish: (event: PointerEvent) => void;
  readonly cancel: (event: PointerEvent) => void;
}

interface UseSceneDragOptions {
  readonly scenes: readonly Scene[];
  readonly disabled: boolean;
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly onReorder: (ids: readonly string[]) => void;
}

export function useSceneDrag({ scenes, disabled, scrollRef, onReorder }: UseSceneDragOptions) {
  const [orderedScenes, setOrderedScenes] = useState<readonly Scene[]>(scenes);
  const [draggingId, setDraggingId] = useState<string>();
  const [dragVisual, setDragVisual] = useState<SceneDragVisual>();
  const orderedRef = useRef<readonly Scene[]>(scenes);
  const latestScenesRef = useRef<readonly Scene[]>(scenes);
  const dragRef = useRef<{ id: string; pointerId: number; lastTargetId: string } | undefined>(undefined);
  const dropTimerRef = useRef<number | undefined>(undefined);
  const pageLockOwnerRef = useRef(Symbol("scene-drag"));
  const listRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef<DragListeners | undefined>(undefined);

  useLayoutEffect(() => {
    latestScenesRef.current = scenes;
    const nextOrder = dragRef.current ? mergeSceneOrder(orderedRef.current, scenes) : scenes;
    orderedRef.current = nextOrder;
    setOrderedScenes(nextOrder);
  }, [scenes]);

  useEffect(() => () => {
    window.clearTimeout(dropTimerRef.current);
    detachListeners(listenersRef);
    unlockPageScroll(pageLockOwnerRef.current);
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, scene: Scene) {
    if (disabled || !event.isPrimary || event.button !== 0) return;
    const row = event.currentTarget.closest<HTMLElement>("[data-scene-id]");
    if (!row) return;
    event.preventDefault();
    window.clearTimeout(dropTimerRef.current);
    lockPageScroll(pageLockOwnerRef.current);
    const bounds = row.getBoundingClientRect();
    const index = orderedRef.current.findIndex(({ id }) => id === scene.id);
    dragRef.current = { id: scene.id, pointerId: event.pointerId, lastTargetId: scene.id };
    setDraggingId(scene.id);
    setDragVisual({
      scene, index: Math.max(0, index), x: event.clientX, y: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
      width: bounds.width, height: bounds.height, dropping: false,
    });
    const listeners = { move: updateDrag, finish: finishDrag, cancel: cancelDrag };
    listenersRef.current = listeners;
    window.addEventListener("pointermove", listeners.move, { capture: true });
    window.addEventListener("pointerup", listeners.finish, { capture: true });
    window.addEventListener("pointercancel", listeners.cancel, { capture: true });
  }

  function updateDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setDragVisual((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
    autoScroll(scrollRef.current, event.clientY);
    const targetId = listRef.current ? findNearestSceneId(listRef.current, event.clientY) : undefined;
    if (!targetId || targetId === drag.lastTargetId) return;
    drag.lastTargetId = targetId;
    const current = orderedRef.current;
    const from = current.findIndex(({ id }) => id === drag.id);
    const to = current.findIndex(({ id }) => id === targetId);
    const reordered = moveScene(current, from, to);
    if (reordered === current) return;
    orderedRef.current = reordered;
    setOrderedScenes(reordered);
    setDragVisual((visual) => visual ? { ...visual, index: to } : visual);
  }

  function finishDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    dragRef.current = undefined;
    detachListeners(listenersRef);
    unlockPageScroll(pageLockOwnerRef.current);
    const completeOrder = mergeSceneOrder(orderedRef.current, latestScenesRef.current);
    orderedRef.current = completeOrder;
    setOrderedScenes(completeOrder);
    animateDrop(drag.id);
    if (hasSceneOrderChanged(completeOrder, latestScenesRef.current)) onReorder(completeOrder.map(({ id }) => id));
  }

  function cancelDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    dragRef.current = undefined;
    detachListeners(listenersRef);
    unlockPageScroll(pageLockOwnerRef.current);
    orderedRef.current = latestScenesRef.current;
    setOrderedScenes(latestScenesRef.current);
    setDraggingId(undefined);
    setDragVisual(undefined);
  }

  function animateDrop(id: string) {
    const destination = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-scene-id]") ?? [])
      .find((element) => element.dataset.sceneId === id)?.getBoundingClientRect();
    if (!destination) {
      setDragVisual(undefined);
      setDraggingId(undefined);
      return;
    }
    setDragVisual((current) => current ? {
      ...current,
      x: destination.left + current.offsetX,
      y: destination.top + current.offsetY,
      dropping: true,
    } : current);
    dropTimerRef.current = window.setTimeout(() => {
      setDragVisual(undefined);
      setDraggingId(undefined);
    }, 170);
  }

  function moveWithKeyboard(id: string, direction: -1 | 1) {
    const current = orderedRef.current;
    const from = current.findIndex((scene) => scene.id === id);
    const reordered = moveScene(current, from, from + direction);
    if (disabled || reordered === current) return;
    orderedRef.current = reordered;
    setOrderedScenes(reordered);
    onReorder(reordered.map((scene) => scene.id));
  }

  return { orderedScenes, draggingId, dragVisual, listRef, startDrag, moveWithKeyboard };
}

function findNearestSceneId(list: HTMLElement, clientY: number): string | undefined {
  let nearest: { id: string; distance: number } | undefined;
  for (const row of list.querySelectorAll<HTMLElement>("[data-scene-id]")) {
    const id = row.dataset.sceneId;
    if (!id) continue;
    const bounds = row.getBoundingClientRect();
    const distance = Math.abs(clientY - (bounds.top + bounds.height / 2));
    if (!nearest || distance < nearest.distance) nearest = { id, distance };
  }
  return nearest?.id;
}

function autoScroll(container: HTMLElement | null, clientY: number) {
  if (!container) return;
  const bounds = container.getBoundingClientRect();
  const edge = Math.min(52, bounds.height / 4);
  if (clientY < bounds.top + edge) container.scrollTop -= 18;
  else if (clientY > bounds.bottom - edge) container.scrollTop += 18;
}

function detachListeners(ref: { current: DragListeners | undefined }) {
  const listeners = ref.current;
  if (!listeners) return;
  ref.current = undefined;
  window.removeEventListener("pointermove", listeners.move, { capture: true });
  window.removeEventListener("pointerup", listeners.finish, { capture: true });
  window.removeEventListener("pointercancel", listeners.cancel, { capture: true });
}
