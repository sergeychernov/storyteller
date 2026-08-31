import { useImperativeHandle, useState, type ForwardedRef } from "react";

/** Imperative lifecycle shared by every scene renderer preview. */
export interface ScenePreviewLifecycle {
  /** Restores the scene preview and all of its descendants to their initial state. */
  initializeScene(): void;
}

/**
 * Exposes the lifecycle contract and returns a key that remounts the complete
 * renderer subtree. Remounting resets media, animations and component state as
 * one atomic scene initialization.
 */
export function useScenePreviewInitialization(ref: ForwardedRef<ScenePreviewLifecycle>): number {
  const [generation, setGeneration] = useState(0);
  useImperativeHandle(ref, () => ({
    initializeScene: () => setGeneration((value) => value + 1),
  }), []);
  return generation;
}
