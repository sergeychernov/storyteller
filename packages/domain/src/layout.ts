import {
  collageLayoutDefinitions,
  collageLayoutMaterials,
  getCollageLayoutDefinition,
  materialOrientationSequence,
  type CollageLayoutDefinition,
} from "./collage-layout.js";
import type { SceneMaterial } from "./model.js";

export interface LayoutOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export function getAutomaticCollageLayout(materials: readonly SceneMaterial[]): CollageLayoutDefinition | undefined {
  const options = getCollageLayoutOptions(materials);
  return options.length === 1 ? options[0] : undefined;
}

/** Every option has accepted the edited media formats and exact crop-aware orientation sequence. */
export function getCollageLayoutOptions(materials: readonly SceneMaterial[]): readonly CollageLayoutDefinition[] {
  const candidates = collageLayoutMaterials(materials);
  return collageLayoutDefinitions.filter((layout) => layout.validate(candidates).valid);
}

export function getSelectedCollageLayout(
  materials: readonly SceneMaterial[], requested?: string,
): CollageLayoutDefinition | undefined {
  const candidates = collageLayoutMaterials(materials);
  if (requested) {
    const layout = getCollageLayoutDefinition(requested);
    return layout?.validate(candidates).valid ? layout : undefined;
  }
  const options = collageLayoutDefinitions.filter((layout) => layout.validate(candidates).valid);
  return options.length === 1 ? options[0] : undefined;
}

export function getLayoutOptions(materials: readonly SceneMaterial[]): readonly LayoutOption[] {
  if (materials.length === 0) return [];
  if (materials.length === 1) return [option("full-frame", "Весь кадр", "Один материал заполняет сцену")];
  const collage = getCollageLayoutOptions(materials);
  if (collage.length) return collage;
  const sequence = materialOrientationSequence(materials);
  return [
    option("overlap-stack", "Карточки внахлёст", "Универсальный каскад в исходном порядке"),
    option("custom", "Спроектировать layout", `Для последовательности ${sequence || "—"} нужен отдельный макет`),
  ];
}

function option(id: string, label: string, description: string): LayoutOption {
  return { id, label, description };
}
