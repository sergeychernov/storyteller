import type { Scene } from "../../api.js";

export function moveMaterialBetweenScenes(
  scenes: readonly Scene[],
  sourceSceneId: string,
  materialId: string,
  targetSceneId: string,
  targetIndex: number,
): readonly Scene[] {
  if (sourceSceneId === targetSceneId || !Number.isInteger(targetIndex) || targetIndex < 0) return scenes;
  const source = scenes.find(({ id }) => id === sourceSceneId);
  const target = scenes.find(({ id }) => id === targetSceneId);
  const material = source?.materials.find(({ id }) => id === materialId);
  if (!source || !target || !material || targetIndex > target.materials.length) return scenes;

  return scenes.map((scene) => {
    if (scene.id === sourceSceneId) return {
      ...scene,
      materials: scene.materials.filter(({ id }) => id !== materialId),
    };
    if (scene.id === targetSceneId) {
      const materials = [...scene.materials];
      materials.splice(targetIndex, 0, material);
      return { ...scene, materials };
    }
    return scene;
  });
}
