export function mergeMaterialOrder<T extends { readonly id: string }>(
  localOrder: readonly T[],
  authoritativeMaterials: readonly T[],
): readonly T[] {
  const authoritativeById = new Map(authoritativeMaterials.map((material) => [material.id, material]));
  const merged: T[] = [];
  const included = new Set<string>();

  for (const material of localOrder) {
    const authoritative = authoritativeById.get(material.id);
    if (!authoritative) continue;
    merged.push(authoritative);
    included.add(material.id);
  }
  for (const material of authoritativeMaterials) {
    if (included.has(material.id)) continue;
    merged.push(material);
  }
  return merged;
}
