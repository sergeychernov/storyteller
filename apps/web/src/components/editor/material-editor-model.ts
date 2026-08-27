import type { MaterialCrop, MaterialEdit, MaterialRotation, VideoTrim } from "../../api.js";

export type CropDragMode = "move" | "north-west" | "north-east" | "south-west" | "south-east";

export const fullCrop: MaterialCrop = { x: 0, y: 0, width: 1, height: 1 };
export const identityEdit: MaterialEdit = { rotation: 0, crop: fullCrop };

export function rotateEdit(edit: MaterialEdit, clockwise: boolean): MaterialEdit {
  const crop = edit.crop;
  return clockwise ? {
    ...edit,
    rotation: normalizeRotation(edit.rotation + 90),
    crop: normalizedCrop({ x: 1 - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width }),
  } : {
    ...edit,
    rotation: normalizeRotation(edit.rotation - 90),
    crop: normalizedCrop({ x: crop.y, y: 1 - crop.x - crop.width, width: crop.height, height: crop.width }),
  };
}

export function resizeCrop(crop: MaterialCrop, mode: CropDragMode, dx: number, dy: number): MaterialCrop {
  const minimum = 0.04;
  if (mode === "move") return {
    ...crop,
    x: clamp(crop.x + dx, 0, 1 - crop.width),
    y: clamp(crop.y + dy, 0, 1 - crop.height),
  };
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;
  if (mode.endsWith("west")) left = clamp(left + dx, 0, right - minimum);
  if (mode.endsWith("east")) right = clamp(right + dx, left + minimum, 1);
  if (mode.startsWith("north")) top = clamp(top + dy, 0, bottom - minimum);
  if (mode.startsWith("south")) bottom = clamp(bottom + dy, top + minimum, 1);
  return normalizedCrop({ x: left, y: top, width: right - left, height: bottom - top });
}

export function cropForAspect(dimensions: { width: number; height: number }, aspect: number): MaterialCrop {
  const sourceAspect = dimensions.width / dimensions.height;
  if (sourceAspect > aspect) {
    const width = aspect / sourceAspect;
    return normalizedCrop({ x: (1 - width) / 2, y: 0, width, height: 1 });
  }
  const height = sourceAspect / aspect;
  return normalizedCrop({ x: 0, y: (1 - height) / 2, width: 1, height });
}

export function rotatedDimensions(width: number, height: number, rotation: MaterialRotation) {
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

export function cropPixelSize(sourceSize: number, start: number, size: number, even = false): number {
  if (even) {
    const usable = sourceSize - sourceSize % 2;
    const left = Math.min(usable - 2, Math.floor(start * sourceSize / 2) * 2);
    const right = Math.max(left + 2, Math.min(usable, Math.ceil((start + size) * sourceSize / 2) * 2));
    return right - left;
  }
  return Math.max(1, Math.min(sourceSize, Math.ceil((start + size) * sourceSize)) - Math.floor(start * sourceSize));
}

export function sameEdit(left: MaterialEdit, right: MaterialEdit): boolean {
  return left.rotation === right.rotation && (["x", "y", "width", "height"] as const)
    .every((key) => Math.abs(left.crop[key] - right.crop[key]) < 0.000_001)
    && left.trim?.startSeconds === right.trim?.startSeconds && left.trim?.endSeconds === right.trim?.endSeconds;
}

export function updateTrimBoundary(range: VideoTrim, boundary: keyof VideoTrim, value: number, duration: number): VideoTrim {
  if (!Number.isFinite(value) || !Number.isFinite(duration) || duration <= 0) return range;
  return boundary === "startSeconds"
    ? { ...range, startSeconds: clamp(value, 0, range.endSeconds - Math.min(0.1, range.endSeconds)) }
    : { ...range, endSeconds: clamp(value, range.startSeconds + Math.min(0.1, duration - range.startSeconds), duration) };
}

export function withVideoTrim(edit: MaterialEdit, range: VideoTrim, duration: number): MaterialEdit {
  const { trim: _previous, ...spatialEdit } = edit;
  return range.startSeconds === 0 && range.endSeconds === duration ? spatialEdit : { ...spatialEdit, trim: range };
}

function normalizedCrop(crop: MaterialCrop): MaterialCrop {
  return {
    x: precise(clamp(crop.x, 0, 1)), y: precise(clamp(crop.y, 0, 1)),
    width: precise(clamp(crop.width, 0.04, 1)), height: precise(clamp(crop.height, 0.04, 1)),
  };
}

function normalizeRotation(value: number): MaterialRotation {
  return ((value % 360 + 360) % 360) as MaterialRotation;
}

function precise(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)); }
