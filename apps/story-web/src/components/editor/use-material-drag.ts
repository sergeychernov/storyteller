import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { mergeMaterialOrder } from "@storyteller/domain";
import type { SceneMaterial } from "../../api.js";
import { useMaterialSceneDrag } from "./MaterialSceneDragContext.js";
import { lockPageScroll, unlockPageScroll } from "./pointer-drag-page-lock.js";

export interface MaterialDragVisual {
  readonly material: SceneMaterial;
  readonly x: number;
  readonly y: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly dropping: boolean;
  readonly movingToScene: boolean;
}

interface DragListeners {
  readonly move: (event: PointerEvent) => void;
  readonly finish: (event: PointerEvent) => void;
  readonly cancel: (event: PointerEvent) => void;
}

interface UseMaterialDragOptions {
  readonly materials: readonly SceneMaterial[];
  readonly sceneId: string;
  readonly saving: boolean;
  readonly onReorder: (ids: readonly string[]) => void;
  readonly onMoveToScene: (materialId: string, targetSceneId: string) => void;
}

export function useMaterialDrag({ materials, sceneId, saving, onReorder, onMoveToScene }: UseMaterialDragOptions) {
  const sceneDrop = useMaterialSceneDrag();
  const [orderedMaterials, setOrderedMaterials] = useState<readonly SceneMaterial[]>(materials);
  const [draggingId, setDraggingId] = useState<string>();
  const [dragVisual, setDragVisual] = useState<MaterialDragVisual>();
  const orderedRef = useRef<readonly SceneMaterial[]>(materials);
  const latestMaterialsRef = useRef<readonly SceneMaterial[]>(materials);
  const dragRef = useRef<{
    id: string; pointerId: number; lastTargetId: string; targetSceneId: string | undefined;
  } | undefined>(undefined);
  const dropTimerRef = useRef<number | undefined>(undefined);
  const pageLockOwnerRef = useRef(Symbol("material-drag"));
  const stripRef = useRef<HTMLDivElement>(null);
  const dragListenersRef = useRef<DragListeners | undefined>(undefined);

  useLayoutEffect(() => {
    latestMaterialsRef.current = materials;
    const nextOrder = dragRef.current ? mergeMaterialOrder(orderedRef.current, materials) : materials;
    orderedRef.current = nextOrder;
    setOrderedMaterials(nextOrder);
  }, [materials]);

  useEffect(() => () => {
    window.clearTimeout(dropTimerRef.current);
    detachDragListeners(dragListenersRef);
    unlockPageScroll(pageLockOwnerRef.current);
    sceneDrop.end();
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLElement>, material: SceneMaterial) {
    if (saving) return;
    event.preventDefault();
    window.clearTimeout(dropTimerRef.current);
    lockPageScroll(pageLockOwnerRef.current);
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { id: material.id, pointerId: event.pointerId, lastTargetId: material.id, targetSceneId: undefined };
    sceneDrop.begin(sceneId, material.id);
    setDraggingId(material.id);
    if (bounds) setDragVisual({
      material, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
      width: bounds.width, height: bounds.height, dropping: false, movingToScene: false,
    });
    const listeners: DragListeners = {
      move: updateDrag,
      finish: finishDrag,
      cancel: cancelDrag,
    };
    dragListenersRef.current = listeners;
    window.addEventListener("pointermove", listeners.move, { capture: true });
    window.addEventListener("pointerup", listeners.finish, { capture: true });
    window.addEventListener("pointercancel", listeners.cancel, { capture: true });
  }

  function updateDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setDragVisual((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current);
    const hoveredScene = findSceneAtPoint(event.clientX, event.clientY);
    if (hoveredScene) {
      const targetSceneId = hoveredScene.id === sceneId ? undefined : hoveredScene.id;
      drag.targetSceneId = targetSceneId;
      sceneDrop.hover(targetSceneId);
      setDragVisual((current) => current ? { ...current, movingToScene: targetSceneId !== undefined } : current);
      autoScrollVertically(hoveredScene.scrollContainer, event.clientY);
      return;
    }
    if (drag.targetSceneId) {
      drag.targetSceneId = undefined;
      sceneDrop.hover(undefined);
      setDragVisual((current) => current ? { ...current, movingToScene: false } : current);
    }
    const strip = stripRef.current;
    if (strip) {
      const bounds = strip.getBoundingClientRect();
      if (event.clientX < bounds.left + 36) strip.scrollLeft -= 14;
      else if (event.clientX > bounds.right - 36) strip.scrollLeft += 14;
    }
    const targetId = strip ? findNearestMaterialId(strip, event.clientX) : undefined;
    if (!targetId || targetId === drag.lastTargetId) return;
    drag.lastTargetId = targetId;
    const current = orderedRef.current;
    const from = current.findIndex(({ id }) => id === drag.id);
    const to = current.findIndex(({ id }) => id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const reordered = moveMaterial(current, from, to);
    orderedRef.current = reordered;
    setOrderedMaterials(reordered);
  }

  function finishDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    dragRef.current = undefined;
    detachDragListeners(dragListenersRef);
    unlockPageScroll(pageLockOwnerRef.current);
    sceneDrop.end();
    if (drag.targetSceneId) {
      orderedRef.current = latestMaterialsRef.current;
      setOrderedMaterials(latestMaterialsRef.current);
      animateDropToScene(drag.targetSceneId);
      onMoveToScene(drag.id, drag.targetSceneId);
      return;
    }
    animateDrop(drag.id);
    const completeOrder = mergeMaterialOrder(orderedRef.current, latestMaterialsRef.current);
    orderedRef.current = completeOrder;
    setOrderedMaterials(completeOrder);
    const ids = completeOrder.map(({ id }) => id);
    if (ids.some((id, index) => id !== latestMaterialsRef.current[index]?.id)) onReorder(ids);
  }

  function animateDrop(id: string) {
    const destination = Array.from(document.querySelectorAll<HTMLElement>("[data-material-id]"))
      .find((element) => element.dataset.materialId === id)?.getBoundingClientRect();
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

  function animateDropToScene(targetSceneId: string) {
    const destination = Array.from(document.querySelectorAll<HTMLElement>("[data-scene-drop-id]"))
      .find((element) => element.dataset.sceneDropId === targetSceneId)?.getBoundingClientRect();
    if (!destination) {
      setDragVisual(undefined);
      setDraggingId(undefined);
      return;
    }
    setDragVisual((current) => current ? {
      ...current,
      x: destination.left + destination.width / 2,
      y: destination.top + destination.height / 2,
      offsetX: current.width / 2,
      offsetY: current.height / 2,
      dropping: true,
      movingToScene: true,
    } : current);
    dropTimerRef.current = window.setTimeout(() => {
      setDragVisual(undefined);
      setDraggingId(undefined);
    }, 170);
  }

  function cancelDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    dragRef.current = undefined;
    detachDragListeners(dragListenersRef);
    unlockPageScroll(pageLockOwnerRef.current);
    sceneDrop.end();
    orderedRef.current = latestMaterialsRef.current;
    setOrderedMaterials(latestMaterialsRef.current);
    setDraggingId(undefined);
    setDragVisual(undefined);
  }

  function moveWithKeyboard(id: string, direction: -1 | 1) {
    const from = orderedRef.current.findIndex((material) => material.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= orderedRef.current.length || saving) return;
    const reordered = moveMaterial(orderedRef.current, from, to);
    orderedRef.current = reordered;
    setOrderedMaterials(reordered);
    onReorder(reordered.map((material) => material.id));
  }

  return { orderedMaterials, draggingId, dragVisual, stripRef, startDrag, moveWithKeyboard };
}

function findSceneAtPoint(clientX: number, clientY: number): {
  readonly id: string; readonly scrollContainer: HTMLElement | null;
} | undefined {
  const row = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-scene-drop-id]");
  const id = row?.dataset.sceneDropId;
  return id ? { id, scrollContainer: row.closest<HTMLElement>("[data-scene-drop-scroll]") } : undefined;
}

function autoScrollVertically(container: HTMLElement | null, clientY: number) {
  if (!container) return;
  const bounds = container.getBoundingClientRect();
  const edge = Math.min(52, bounds.height / 4);
  if (clientY < bounds.top + edge) container.scrollTop -= 18;
  else if (clientY > bounds.bottom - edge) container.scrollTop += 18;
}

function moveMaterial<T>(items: readonly T[], from: number, to: number): readonly T[] {
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  if (moved !== undefined) reordered.splice(to, 0, moved);
  return reordered;
}

function findNearestMaterialId(strip: HTMLElement, clientX: number): string | undefined {
  const cards = Array.from(strip.querySelectorAll<HTMLElement>("[data-material-id]"));
  let nearest: { id: string; distance: number } | undefined;
  for (const card of cards) {
    const id = card.dataset.materialId;
    if (!id) continue;
    const bounds = card.getBoundingClientRect();
    const distance = Math.abs(clientX - (bounds.left + bounds.width / 2));
    if (!nearest || distance < nearest.distance) nearest = { id, distance };
  }
  return nearest?.id;
}

function detachDragListeners(ref: { current: DragListeners | undefined }) {
  const listeners = ref.current;
  if (!listeners) return;
  ref.current = undefined;
  window.removeEventListener("pointermove", listeners.move, { capture: true });
  window.removeEventListener("pointerup", listeners.finish, { capture: true });
  window.removeEventListener("pointercancel", listeners.cancel, { capture: true });
}
