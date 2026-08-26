import { clampUnit } from "@storyteller/domain";
import type { FocusPoint } from "../../api.js";

interface PointerBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function focusPointFromClient(bounds: PointerBounds, clientX: number, clientY: number): FocusPoint {
  return {
    x: clampUnit((clientX - bounds.left) / bounds.width),
    y: clampUnit((clientY - bounds.top) / bounds.height),
  };
}
