export function moveScene<T>(scenes: readonly T[], from: number, to: number): readonly T[] {
  if (from < 0 || to < 0 || from >= scenes.length || to >= scenes.length || from === to) return scenes;
  const reordered = [...scenes];
  const [moved] = reordered.splice(from, 1);
  if (moved !== undefined) reordered.splice(to, 0, moved);
  return reordered;
}

/** Keeps the local drag order while accepting additions, deletions and fresh scene data from the server. */
export function mergeSceneOrder<T extends { readonly id: string }>(
  localOrder: readonly T[],
  authoritativeScenes: readonly T[],
): readonly T[] {
  const authoritativeById = new Map(authoritativeScenes.map((scene) => [scene.id, scene]));
  const merged: T[] = [];
  const included = new Set<string>();
  for (const scene of localOrder) {
    const authoritative = authoritativeById.get(scene.id);
    if (!authoritative) continue;
    merged.push(authoritative);
    included.add(scene.id);
  }
  for (const scene of authoritativeScenes) {
    if (!included.has(scene.id)) merged.push(scene);
  }
  return merged;
}

export function hasSceneOrderChanged<T extends { readonly id: string }>(
  scenes: readonly T[],
  reference: readonly T[],
): boolean {
  return scenes.length !== reference.length || scenes.some((scene, index) => scene.id !== reference[index]?.id);
}
