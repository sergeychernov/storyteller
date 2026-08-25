export type SceneCarouselSlot<T extends { readonly id: string }> =
  | { readonly key: string; readonly kind: "scene"; readonly scene: T; readonly index: number }
  | { readonly key: string; readonly kind: "edge"; readonly edge: "before" | "after" | "empty" };

export const sceneCarouselKey = (id: string) => `scene:${id}`;

export function buildSceneCarouselSlots<T extends { readonly id: string }>(scenes: readonly T[]): readonly SceneCarouselSlot<T>[] {
  if (!scenes.length) return [{ key: "edge:empty", kind: "edge", edge: "empty" }];
  return [
    { key: "edge:before", kind: "edge", edge: "before" },
    ...scenes.map((scene, index) => ({ key: sceneCarouselKey(scene.id), kind: "scene" as const, scene, index })),
    { key: "edge:after", kind: "edge", edge: "after" },
  ];
}
