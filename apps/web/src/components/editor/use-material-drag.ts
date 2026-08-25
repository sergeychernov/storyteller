import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { mergeMaterialOrder } from "@storyteller/domain";
import type { SceneMaterial } from "../../api.js";

export interface MaterialDragVisual {
  readonly material: SceneMaterial;
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

interface UseMaterialDragOptions {
  readonly materials: readonly SceneMaterial[];
  readonly saving: boolean;
  readonly onReorder: (ids: readonly string[]) => void;
}

export function useMaterialDrag({ materials, saving, onReorder }: UseMaterialDragOptions) {
  const [orderedMaterials, setOrderedMaterials] = useState<readonly SceneMaterial[]>(materials);
  const [draggingId, setDraggingId] = useState<string>();
  const [dragVisual, setDragVisual] = useState<MaterialDragVisual>();
  const orderedRef = useRef<readonly SceneMaterial[]>(materials);
  const latestMaterialsRef = useRef<readonly SceneMaterial[]>(materials);
  const dragRef = useRef<{ id: string; pointerId: number; lastTargetId: string } | undefined>(undefined);
  const dropTimerRef = useRef<number | undefined>(undefined);
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
    unlockPageScroll();
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLElement>, material: SceneMaterial) {
    if (saving) return;
    event.preventDefault();
    window.clearTimeout(dropTimerRef.current);
    lockPageScroll();
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { id: material.id, pointerId: event.pointerId, lastTargetId: material.id };
    setDraggingId(material.id);
    if (bounds) setDragVisual({
      material, x: event.clientX, y: event.clientY,
      offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
      width: bounds.width, height: bounds.height, dropping: false,
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
    unlockPageScroll();
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

  function cancelDrag(event: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    dragRef.current = undefined;
    detachDragListeners(dragListenersRef);
    unlockPageScroll();
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

interface PageScrollLock {
  readonly bodyTouchAction: string;
  readonly rootOverscrollBehavior: string;
}

let pageScrollLock: PageScrollLock | undefined;

function preventPageScroll(event: Event) {
  event.preventDefault();
}

function lockPageScroll() {
  if (pageScrollLock) return;
  const body = document.body;
  const root = document.documentElement;
  pageScrollLock = {
    bodyTouchAction: body.style.touchAction,
    rootOverscrollBehavior: root.style.overscrollBehavior,
  };
  body.style.touchAction = "none";
  root.style.overscrollBehavior = "none";
  document.addEventListener("touchmove", preventPageScroll, { passive: false });
  document.addEventListener("wheel", preventPageScroll, { passive: false });
}

function unlockPageScroll() {
  const lock = pageScrollLock;
  if (!lock) return;
  pageScrollLock = undefined;
  const body = document.body;
  body.style.touchAction = lock.bodyTouchAction;
  const root = document.documentElement;
  root.style.overscrollBehavior = lock.rootOverscrollBehavior;
  document.removeEventListener("touchmove", preventPageScroll);
  document.removeEventListener("wheel", preventPageScroll);
}
