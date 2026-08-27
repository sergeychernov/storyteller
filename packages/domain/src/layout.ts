import { getMaterialPresentation, type SceneMaterial } from "./model.js";

export interface LayoutOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

const canonicalLayouts: Readonly<Record<string, LayoutOption>> = {
  ll: option("stack", "Стопка", "Два широких кадра друг над другом"),
  ppl: option("2+1", "Два плюс один", "Пара портретов и широкий финальный кадр"),
  pppp: option("2x2", "Сетка 2×2", "Равномерный ритм из четырёх портретов"),
  ppll: option("2+1+1", "Два, один, один", "Портретная пара и два широких акцента"),
  pplpp: option("2+1+2", "Два, один, два", "Широкий кадр становится центром сцены"),
  ppppl: option("2+2+1", "Два, два, один", "Широкий кадр завершает сцену"),
  ppppll: option("2+2+1+1", "Два, два, один, один", "Каскад от портретов к широким кадрам"),
};

const portraitSix = [
  option("portrait-pairs-descending", "Пары · вниз", "Портретные пары каскадом сверху вниз"),
  option("portrait-pairs-ascending", "Пары · вверх", "Портретные пары каскадом снизу вверх"),
  option("portrait-triples-descending", "Тройки · вниз", "Две тройки с движением сверху вниз"),
  option("portrait-triples-ascending", "Тройки · вверх", "Две тройки с движением снизу вверх"),
] as const;

export function materialOrientationSequence(materials: readonly SceneMaterial[]): string {
  return materials.map((material) => getMaterialPresentation(material).orientation === "portrait" ? "p" : "l").join("");
}

export function getLayoutOptions(materials: readonly SceneMaterial[]): readonly LayoutOption[] {
  if (materials.length === 0) return [];
  if (materials.length === 1) return [option("full-frame", "Весь кадр", "Один материал заполняет сцену")];
  const sequence = materialOrientationSequence(materials);
  if (sequence === "pppppp") return portraitSix;
  const canonical = canonicalLayouts[sequence];
  return canonical
    ? [canonical, option("overlap-stack", "Карточки внахлёст", "Материалы входят по очереди и сохраняют крупный размер")]
    : [
        option("overlap-stack", "Карточки внахлёст", "Универсальный каскад в исходном порядке"),
        option("custom", "Спроектировать layout", "Для этой последовательности нужен отдельный макет"),
      ];
}

function option(id: string, label: string, description: string): LayoutOption {
  return { id, label, description };
}
