import type { DragEvent, MouseEvent, VideoHTMLAttributes } from "react";

type PreventableEvent = Pick<Event, "preventDefault">;

export function preventNativeMediaAction(event: PreventableEvent): void {
  event.preventDefault();
}

export function NativeDragSafeVideo({
  style, onContextMenu, onDragStart, ...props
}: VideoHTMLAttributes<HTMLVideoElement>) {
  function preventContextMenu(event: MouseEvent<HTMLVideoElement>) {
    preventNativeMediaAction(event.nativeEvent);
    onContextMenu?.(event);
  }

  function preventBrowserDrag(event: DragEvent<HTMLVideoElement>) {
    preventNativeMediaAction(event.nativeEvent);
    onDragStart?.(event);
  }

  return <video
    {...props}
    draggable={false}
    disablePictureInPicture
    disableRemotePlayback
    onContextMenu={preventContextMenu}
    onDragStart={preventBrowserDrag}
    style={{ ...style, pointerEvents: "none", userSelect: "none", WebkitUserSelect: "none", touchAction: "none" }}
  />;
}
