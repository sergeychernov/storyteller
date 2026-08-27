import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { MaterialCrop, MaterialEdit, MaterialRotation, SceneMaterial } from "../../api.js";
import styles from "./MaterialEditor.module.css";
import { resizeCrop, type CropDragMode } from "./material-editor-model.js";

interface MaterialCropStageProps {
  readonly material: SceneMaterial;
  readonly url: string | undefined;
  readonly loading: boolean;
  readonly sourceFailed: boolean;
  readonly edit: MaterialEdit;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly disabled: boolean;
  readonly onCropChange: (crop: MaterialCrop) => void;
}

interface DragState { readonly mode: CropDragMode; readonly x: number; readonly y: number; readonly crop: MaterialCrop }

export function MaterialCropStage({
  material, url, loading, sourceFailed, edit, width, height, label, disabled, onCropChange,
}: MaterialCropStageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | undefined>(undefined);

  useEffect(() => {
    const target = canvas.current;
    if (!target || !url) return;
    const context = target.getContext("2d");
    if (!context) return;
    if (material.kind === "image") {
      const image = new Image();
      image.onload = () => drawRotated(context, target, image, edit.rotation);
      image.src = url;
      return () => { image.onload = null; };
    }
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadeddata = () => drawRotated(context, target, video, edit.rotation);
    video.src = url;
    video.load();
    return () => {
      video.onloadeddata = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [edit.rotation, material.kind, url, width, height]);

  function startDrag(event: ReactPointerEvent, mode: CropDragMode) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = { mode, x: event.clientX, y: event.clientY, crop: edit.crop };
    stage.current?.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent) {
    const active = drag.current;
    const bounds = stage.current?.getBoundingClientRect();
    if (!active || !bounds) return;
    onCropChange(resizeCrop(active.crop, active.mode, (event.clientX - active.x) / bounds.width, (event.clientY - active.y) / bounds.height));
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.05 : 0.01;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    onCropChange(resizeCrop(edit.crop, "move", dx, dy));
  }

  return <div
    className={styles.stage}
    ref={stage}
    style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, ${Math.max(1, Math.min(540, 470 * width / height))}px)` }}
    onPointerMove={moveDrag}
    onPointerUp={() => { drag.current = undefined; }}
    onPointerCancel={() => { drag.current = undefined; }}
  >
    <canvas ref={canvas} width={width} height={height} />
    {(loading || sourceFailed) && <div className={styles.sourceState}>{sourceFailed ? "!" : "…"}</div>}
    {url && <div
      className={styles.cropBox}
      role="group"
      aria-label={label}
      tabIndex={disabled ? -1 : 0}
      style={{
        left: `${edit.crop.x * 100}%`, top: `${edit.crop.y * 100}%`,
        width: `${edit.crop.width * 100}%`, height: `${edit.crop.height * 100}%`,
      }}
      onPointerDown={(event) => startDrag(event, "move")}
      onKeyDown={moveWithKeyboard}
    >
      {(["north-west", "north-east", "south-west", "south-east"] as const).map((mode) => <span
        className={styles[mode]}
        key={mode}
        onPointerDown={(event) => startDrag(event, mode)}
      />)}
    </div>}
  </div>;
}

function drawRotated(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  rotation: MaterialRotation,
) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  const sideways = rotation === 90 || rotation === 270;
  const width = sideways ? canvas.height : canvas.width;
  const height = sideways ? canvas.width : canvas.height;
  context.drawImage(source, -width / 2, -height / 2, width, height);
  context.restore();
}
