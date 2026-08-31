import { DomainError } from "./errors.js";
import {
  collageCardAngleDefaultMaximumDegrees, collageCardAngleMap, collageCardAngleMinimumDegrees,
  collageCardOffsetMap, collageCardOffsetMaximumStep, collageCardOffsetMinimumStep,
  getCollageCardShadowMetrics, getCollageFrameWidth,
} from "./collage.js";
import {
  getMaterialDisplaySize, type CollageCardAngle, type CollageCardOffset, type CollageSettings, type SceneMaterial,
} from "./model.js";

export const collageLayoutEditorIds = ["paper-stack", "paper-rows", "paper-cascade"] as const;
export type CollageLayoutEditorId = (typeof collageLayoutEditorIds)[number];

export interface CollageBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CollageEntrance extends CollageBox {
  /** Paint order follows appearance order so every later card lands above earlier cards. */
  readonly stackOrder: number;
  /** Translation from the final box to a fully off-stage start, including rotation and shadow. */
  readonly startOffsetX: number;
  readonly startOffsetY: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly direction: "left" | "right" | "bottom";
  readonly startAngleDegrees: number;
  readonly finalAngleDegrees: number;
}

/** Dimensions must describe the edited/cropped presentation, not the original file. */
export interface CollageLayoutMaterial {
  readonly id: string;
  readonly kind: "image" | "video";
  readonly width: number;
  readonly height: number;
}

export type CollageLayoutValidation =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly code: "material-count" | "material-format" | "orientation-sequence";
      readonly expected: string;
      readonly actual: string;
    };

export interface CollageLayoutRenderInput {
  readonly materials: readonly CollageLayoutMaterial[];
  readonly width: number;
  readonly height: number;
  readonly settings: CollageSettings;
}

export interface CollageLayoutRenderer {
  /** Persisted in render jobs so a layout cannot silently switch implementation. */
  readonly id: string;
  readonly createSchedule: (input: CollageLayoutRenderInput) => readonly CollageEntrance[];
}

export interface CollageLayoutDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly requirements: {
    readonly materialKinds: readonly CollageLayoutMaterial["kind"][];
    readonly orientationSequence: string;
  };
  readonly editorId: CollageLayoutEditorId;
  /** Fixed card intersection for this layout; calibrated in the Storybook layout gallery. */
  readonly overlapRatio: number;
  /** Final row grouping is also the sign policy for persisted resting angles. */
  readonly rowSizes: readonly number[];
  readonly renderer: CollageLayoutRenderer;
  readonly validate: (materials: readonly CollageLayoutMaterial[]) => CollageLayoutValidation;
}

const stack = defineLayout({
  id: "stack",
  label: "Стопка",
  description: "Два широких кадра друг над другом",
  sequence: "ll",
  editorId: "paper-stack",
  overlapRatio: 0.4,
  rendererId: "animated-collage.stack.v1",
  rowSizes: [1, 1],
  render: renderStack,
});

const twoPlusOne = defineLayout({
  id: "2+1",
  label: "Два плюс один",
  description: "Пара портретов и широкий финальный кадр",
  sequence: "ppl",
  editorId: "paper-rows",
  overlapRatio: 0.4,
  rendererId: "animated-collage.two-plus-one.v1",
  rowSizes: [2, 1],
  render: renderTwoPlusOne,
});

const twoByTwo = defineLayout({
  id: "2x2",
  label: "Сетка 2×2",
  description: "Равномерный ритм из четырёх портретов",
  sequence: "pppp",
  editorId: "paper-rows",
  overlapRatio: 0.4,
  rendererId: "animated-collage.two-by-two.v1",
  rowSizes: [2, 2],
  render: renderTwoByTwo,
});

const twoPlusOnePlusOne = defineLayout({
  id: "2+1+1",
  label: "Два, один, один",
  description: "Портретная пара и два широких акцента",
  sequence: "ppll",
  editorId: "paper-rows",
  overlapRatio: 0.4,
  rendererId: "animated-collage.two-plus-one-plus-one.v1",
  rowSizes: [2, 1, 1],
  render: renderTwoPlusOnePlusOne,
});

const twoPlusOnePlusTwo = defineLayout({
  id: "2+1+2",
  label: "Два, один, два",
  description: "Широкий кадр становится центром сцены",
  sequence: "pplpp",
  editorId: "paper-rows",
  overlapRatio: 0.4,
  rendererId: "animated-collage.two-plus-one-plus-two.v1",
  rowSizes: [2, 1, 2],
  render: renderTwoPlusOnePlusTwo,
});

const twoPlusTwoPlusOne = defineLayout({
  id: "2+2+1",
  label: "Два, два, один",
  description: "Широкий кадр завершает сцену",
  sequence: "ppppl",
  editorId: "paper-rows",
  overlapRatio: 0.4,
  rendererId: "animated-collage.two-plus-two-plus-one.v1",
  rowSizes: [2, 2, 1],
  render: renderTwoPlusTwoPlusOne,
});

const twoPlusTwoPlusOnePlusOne = defineLayout({
  id: "2+2+1+1",
  label: "Два, два, один, один",
  description: "Каскад от портретов к широким кадрам",
  sequence: "ppppll",
  editorId: "paper-rows",
  overlapRatio: 0.4,
  rendererId: "animated-collage.two-plus-two-plus-one-plus-one.v1",
  rowSizes: [2, 2, 1, 1],
  render: renderTwoPlusTwoPlusOnePlusOne,
});

const portraitPairsDescending = defineLayout({
  id: "portrait-pairs-descending",
  label: "Пары · вниз",
  description: "Портретные пары каскадом сверху вниз",
  sequence: "pppppp",
  editorId: "paper-cascade",
  overlapRatio: 0.4,
  rendererId: "animated-collage.portrait-pairs-descending.v1",
  rowSizes: [2, 2, 2],
  render: renderPortraitPairsDescending,
});

const portraitPairsAscending = defineLayout({
  id: "portrait-pairs-ascending",
  label: "Пары · вверх",
  description: "Портретные пары каскадом снизу вверх",
  sequence: "pppppp",
  editorId: "paper-cascade",
  overlapRatio: 0.4,
  rendererId: "animated-collage.portrait-pairs-ascending.v1",
  rowSizes: [2, 2, 2],
  render: renderPortraitPairsAscending,
});

const portraitTriplesDescending = defineLayout({
  id: "portrait-triples-descending",
  label: "Тройки · вниз",
  description: "Две тройки с движением сверху вниз",
  sequence: "pppppp",
  editorId: "paper-cascade",
  overlapRatio: 0.4,
  rendererId: "animated-collage.portrait-triples-descending.v1",
  rowSizes: [3, 3],
  render: renderPortraitTriplesDescending,
});

const portraitTriplesAscending = defineLayout({
  id: "portrait-triples-ascending",
  label: "Тройки · вверх",
  description: "Две тройки с движением снизу вверх",
  sequence: "pppppp",
  editorId: "paper-cascade",
  overlapRatio: 0.4,
  rendererId: "animated-collage.portrait-triples-ascending.v1",
  rowSizes: [3, 3],
  render: renderPortraitTriplesAscending,
});

export const collageLayoutDefinitions: readonly CollageLayoutDefinition[] = [
  stack,
  twoPlusOne,
  twoByTwo,
  twoPlusOnePlusOne,
  twoPlusOnePlusTwo,
  twoPlusTwoPlusOne,
  twoPlusTwoPlusOnePlusOne,
  portraitPairsDescending,
  portraitPairsAscending,
  portraitTriplesDescending,
  portraitTriplesAscending,
];

export function getCollageLayoutDefinition(layoutId: string): CollageLayoutDefinition | undefined {
  return collageLayoutDefinitions.find(({ id }) => id === layoutId);
}

export function getImplementedCollageOrientationSequences(): readonly string[] {
  return [...new Set(collageLayoutDefinitions.map(({ requirements }) => requirements.orientationSequence))];
}

export function collageLayoutMaterials(materials: readonly SceneMaterial[]): readonly CollageLayoutMaterial[] {
  return materials.map((material) => ({ id: material.id, kind: material.kind, ...getMaterialDisplaySize(material) }));
}

export function materialOrientationSequence(materials: readonly SceneMaterial[]): string {
  return orientationSequence(collageLayoutMaterials(materials));
}

export function createCollageEntranceSchedule(input: CollageLayoutRenderInput & {
  readonly layoutId: string;
  readonly layoutRendererId: string;
  readonly layoutOverlapRatio: number;
}): readonly CollageEntrance[] {
  const layout = getCollageLayoutDefinition(input.layoutId);
  if (!layout) throw new DomainError(`unknown collage layout: ${input.layoutId}`);
  if (input.layoutRendererId !== layout.renderer.id) {
    throw new DomainError(`collage layout renderer does not match ${input.layoutId}: ${input.layoutRendererId}`);
  }
  if (input.layoutOverlapRatio !== layout.overlapRatio) {
    throw new DomainError(`collage layout overlap does not match ${input.layoutId}: ${input.layoutOverlapRatio}`);
  }
  const validation = layout.validate(input.materials);
  if (!validation.valid) {
    throw new DomainError(`collage layout ${input.layoutId} rejected ${validation.code}: expected ${validation.expected}, received ${validation.actual}`);
  }
  return layout.renderer.createSchedule(input);
}

export function createCollageCardAngles(input: {
  readonly layoutId: string;
  readonly materials: readonly Pick<SceneMaterial, "id">[];
  readonly straightCards: boolean;
  readonly seedKey: string;
}): readonly CollageCardAngle[] {
  const layout = getCollageLayoutDefinition(input.layoutId);
  if (!layout) throw new DomainError(`unknown collage layout: ${input.layoutId}`);
  if (layout.rowSizes.reduce((sum, size) => sum + size, 0) !== input.materials.length) {
    throw new DomainError(`collage layout ${input.layoutId} cannot assign angles to ${input.materials.length} materials`);
  }
  const seed = stableSeed(`${input.seedKey}:${input.layoutId}:${input.materials.map(({ id }) => id).join(":")}`);
  const angles: CollageCardAngle[] = [];
  let materialIndex = 0;
  layout.rowSizes.forEach((rowSize, rowIndex) => {
    for (let column = 0; column < rowSize; column += 1) {
      const material = input.materials[materialIndex]!;
      const magnitude = input.straightCards ? 0 : seededMagnitude(seed, materialIndex, rowIndex);
      const sign = rowSize === 2 ? column === 0 ? -1 : 1 : seededSign(seed, materialIndex, rowIndex);
      angles.push({ materialId: material.id, angleDegrees: input.straightCards ? 0 : roundAngle(magnitude * sign) });
      materialIndex += 1;
    }
  });
  return angles;
}

export function createCollageCardOffsets(input: {
  readonly layoutId: string;
  readonly materials: readonly Pick<SceneMaterial, "id">[];
  readonly direction: CollageSettings["rowDirection"];
  readonly seedKey: string;
}): readonly CollageCardOffset[] {
  const layout = getCollageLayoutDefinition(input.layoutId);
  if (!layout) throw new DomainError(`unknown collage layout: ${input.layoutId}`);
  if (layout.rowSizes.reduce((sum, size) => sum + size, 0) !== input.materials.length) {
    throw new DomainError(`collage layout ${input.layoutId} cannot assign offsets to ${input.materials.length} materials`);
  }
  const seed = stableSeed(`${input.seedKey}:${input.layoutId}:${input.direction}:${input.materials.map(({ id }) => id).join(":")}`);
  const offsets: CollageCardOffset[] = [];
  let materialIndex = 0;
  layout.rowSizes.forEach((rowSize, rowIndex) => {
    const positions = [0];
    for (let column = 1; column < rowSize; column += 1) {
      const step = collageCardOffsetMinimumStep + Math.floor(seededUnit(
        seed, materialIndex + column, rowIndex, 0x27d4_eb2d,
      ) * (collageCardOffsetMaximumStep - collageCardOffsetMinimumStep + 1));
      const sign = input.direction === "ascending" ? -1
        : input.direction === "descending" ? 1
        : input.direction === "level" ? 0
        : seededSign(seed, materialIndex + column, rowIndex);
      positions.push(positions[column - 1]! + step * sign);
    }
    const center = (Math.min(...positions) + Math.max(...positions)) / 2;
    positions.forEach((position, column) => offsets.push({
      materialId: input.materials[materialIndex + column]!.id,
      offsetY: Math.round(position - center),
    }));
    materialIndex += rowSize;
  });
  return offsets;
}

function defineLayout(input: {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly sequence: string;
  readonly editorId: CollageLayoutEditorId;
  readonly overlapRatio: number;
  readonly rendererId: string;
  readonly rowSizes: readonly number[];
  readonly render: (input: CollageLayoutRenderInput, overlapRatio: number) => readonly CollageEntrance[];
}): CollageLayoutDefinition {
  if (!Number.isFinite(input.overlapRatio) || input.overlapRatio < 0.3 || input.overlapRatio > 0.5) {
    throw new DomainError(`collage layout ${input.id} overlap ratio must be between 0.3 and 0.5`);
  }
  // Layouts own card geometry. A video card and a still card use the same
  // geometry; only the media renderer inside the card differs.
  const materialKinds = ["image", "video"] as const;
  return {
    id: input.id,
    label: input.label,
    description: input.description,
    requirements: { materialKinds, orientationSequence: input.sequence },
    editorId: input.editorId,
    overlapRatio: input.overlapRatio,
    rowSizes: input.rowSizes,
    renderer: {
      id: input.rendererId,
      createSchedule: (renderInput) => input.render(renderInput, input.overlapRatio),
    },
    validate: exactMediaSequence(input.sequence, materialKinds),
  };
}

function exactMediaSequence(expected: string, acceptedKinds: readonly CollageLayoutMaterial["kind"][]) {
  return (materials: readonly CollageLayoutMaterial[]): CollageLayoutValidation => {
    if (materials.length !== expected.length) {
      return { valid: false, code: "material-count", expected: String(expected.length), actual: String(materials.length) };
    }
    const formats = materials.map(({ kind }) => kind).join(",");
    if (materials.some(({ kind }) => !acceptedKinds.includes(kind))) {
      return { valid: false, code: "material-format", expected: acceptedKinds.join(","), actual: formats };
    }
    const actual = orientationSequence(materials);
    return actual === expected
      ? { valid: true }
      : { valid: false, code: "orientation-sequence", expected, actual };
  };
}

function orientationSequence(materials: readonly CollageLayoutMaterial[]): string {
  return materials.map(({ width, height }) => width < height ? "p" : "l").join("");
}

function renderStack(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [1, 1], "forward", "animated-collage.stack.v1", overlapRatio);
}

function renderTwoPlusOne(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 1], "forward", "animated-collage.two-plus-one.v1", overlapRatio);
}

function renderTwoByTwo(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 2], "forward", "animated-collage.two-by-two.v1", overlapRatio);
}

function renderTwoPlusOnePlusOne(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 1, 1], "forward", "animated-collage.two-plus-one-plus-one.v1", overlapRatio);
}

function renderTwoPlusOnePlusTwo(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 1, 2], "forward", "animated-collage.two-plus-one-plus-two.v1", overlapRatio);
}

function renderTwoPlusTwoPlusOne(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 2, 1], "forward", "animated-collage.two-plus-two-plus-one.v1", overlapRatio);
}

function renderTwoPlusTwoPlusOnePlusOne(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 2, 1, 1], "forward", "animated-collage.two-plus-two-plus-one-plus-one.v1", overlapRatio);
}

function renderPortraitPairsDescending(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 2, 2], "forward", "animated-collage.portrait-pairs-descending.v1", overlapRatio);
}

function renderPortraitPairsAscending(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [2, 2, 2], "reverse", "animated-collage.portrait-pairs-ascending.v1", overlapRatio);
}

function renderPortraitTriplesDescending(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [3, 3], "forward", "animated-collage.portrait-triples-descending.v1", overlapRatio);
}

function renderPortraitTriplesAscending(input: CollageLayoutRenderInput, overlapRatio: number): readonly CollageEntrance[] {
  return renderPaperCards(input, [3, 3], "reverse", "animated-collage.portrait-triples-ascending.v1", overlapRatio);
}

/** Shared paper-card compositor; layout-specific functions own row grouping and stop order. */
function renderPaperCards(
  input: CollageLayoutRenderInput,
  rowSizes: readonly number[],
  appearance: "forward" | "reverse",
  seedKey: string,
  overlapRatio: number,
): readonly CollageEntrance[] {
  if (![input.width, input.height].every((value) => Number.isInteger(value) && value > 0)) {
    throw new DomainError("collage output size must use positive integer pixels");
  }
  if (input.materials.some(({ width, height }) => !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)) {
    throw new DomainError("collage material sizes must be positive");
  }
  if (rowSizes.reduce((sum, size) => sum + size, 0) !== input.materials.length) {
    throw new DomainError(`collage renderer ${seedKey} cannot place ${input.materials.length} materials`);
  }
  const rows = splitRows(input.materials, rowSizes);
  const usableWidth = Math.round(input.width * 0.92);
  const frame = getCollageFrameWidth(input.settings.frame);
  const cardWidth = (columns: number) => Math.floor(usableWidth / (columns - (columns - 1) * overlapRatio));
  let rowCards = rows.map((row) => {
    const maxOuterWidth = cardWidth(row.length);
    return row.map((source) => {
      const maxInnerWidth = Math.max(2, maxOuterWidth - frame * 2);
      // Multi-row cascades fit by increasing row overlap; do not shrink portrait cards
      // prematurely and leave large unused side gutters.
      const maxInnerHeight = Math.max(2, Math.floor(input.height * 0.68) - frame * 2);
      const scale = Math.min(maxInnerWidth / source.width, maxInnerHeight / source.height);
      const innerWidth = Math.max(2, Math.round(source.width * scale));
      const innerHeight = Math.max(2, Math.round(source.height * scale));
      return { width: innerWidth + frame * 2, height: innerHeight + frame * 2 };
    });
  });

  const maximumStackHeight = Math.round(input.height * 0.9);
  let rowHeights = rowCards.map((row) => Math.max(...row.map(({ height }) => height)));
  let verticalOverlapRatio = fitVerticalOverlapRatio(rowHeights, overlapRatio, maximumStackHeight);
  const initialStackHeight = stackHeight(rowHeights, verticalOverlapRatio);
  if (initialStackHeight > maximumStackHeight) {
    const scale = maximumStackHeight / initialStackHeight;
    rowCards = rowCards.map((row) => row.map((card) => ({
      ...card,
      width: Math.max(frame * 2 + 2, Math.round((card.width - frame * 2) * scale) + frame * 2),
      height: Math.max(frame * 2 + 2, Math.round((card.height - frame * 2) * scale) + frame * 2),
    })));
    rowHeights = rowCards.map((row) => Math.max(...row.map(({ height }) => height)));
    verticalOverlapRatio = fitVerticalOverlapRatio(rowHeights, overlapRatio, maximumStackHeight);
  }

  const totalHeight = stackHeight(rowHeights, verticalOverlapRatio);
  const rowY: number[] = [];
  let y = Math.round((input.height - totalHeight) / 2);
  rowHeights.forEach((height, rowIndex) => {
    rowY.push(y);
    const next = rowHeights[rowIndex + 1];
    if (next !== undefined) y += height - Math.round(Math.min(height, next) * verticalOverlapRatio);
  });

  const directions: CollageEntrance["direction"][] = [];
  const boxes: CollageBox[] = [];
  const seed = stableSeed(`${seedKey}:${input.materials.map(({ id }) => id).join(":")}`);
  const finalOffsets = collageCardOffsetMap(input.settings.cardOffsets);
  rowCards.forEach((row, rowIndex) => {
    const overlaps = row.slice(1).map((card, index) => Math.round(
      Math.min(row[index]!.width, card.width) * overlapRatio,
    ));
    const rowWidth = row.reduce((total, { width }) => total + width, 0)
      - overlaps.reduce((total, overlap) => total + overlap, 0);
    const verticalOffsets = rows[rowIndex]!.map(({ id }) => finalOffsets.get(id) ?? 0);
    let x = Math.round((input.width - rowWidth) / 2);
    row.forEach((card, column) => {
      boxes.push({
        x,
        y: Math.round(rowY[rowIndex]! + (rowHeights[rowIndex]! - card.height) / 2 + verticalOffsets[column]!),
        width: card.width,
        height: card.height,
      });
      directions.push(row.length === 1 ? "bottom" : column % 2 === 0 ? "left" : "right");
      x += card.width - (overlaps[column] ?? 0);
    });
  });

  const travel = Math.min(0.7, Math.max(0.35, input.settings.entryDurationSeconds * 0.38));
  const ranks = appearanceRanks(rowSizes, appearance);
  const finalAngles = collageCardAngleMap(input.settings.cardAngles);
  return boxes.map((box, index) => {
    const rank = ranks[index]!;
    const startSeconds = boxes.length === 1 ? 0
      : rank * Math.max(0, input.settings.entryDurationSeconds - travel) / (boxes.length - 1);
    const finalAngleDegrees = input.settings.straightCards ? 0 : finalAngles.get(input.materials[index]!.id) ?? 0;
    const finalBox = rotationSafeBox(box, finalAngleDegrees, input.width, input.height, seedKey);
    const startAngleDegrees = panelRotation(seed, index);
    const startOffset = entranceStartOffset(
      finalBox, directions[index]!, startAngleDegrees, input.width, input.height,
    );
    return {
      ...finalBox,
      stackOrder: rank,
      ...startOffset,
      startSeconds,
      endSeconds: Math.min(input.settings.entryDurationSeconds, startSeconds + travel),
      direction: directions[index]!,
      startAngleDegrees,
      finalAngleDegrees,
    };
  });
}

function entranceStartOffset(
  box: CollageBox,
  direction: CollageEntrance["direction"],
  angleDegrees: number,
  outputWidth: number,
  outputHeight: number,
): Pick<CollageEntrance, "startOffsetX" | "startOffsetY"> {
  const rotated = rotatedBounds(box.width, box.height, angleDegrees);
  const shadowPadding = getCollageCardShadowMetrics(outputWidth).padding;
  const clearance = Math.max(2, Math.ceil(outputWidth * 0.002));
  if (direction === "left") {
    const startX = -(box.width + rotated.width) / 2 - shadowPadding - clearance;
    return { startOffsetX: Math.floor(startX - box.x), startOffsetY: 0 };
  }
  if (direction === "right") {
    const startX = outputWidth - box.width / 2 + rotated.width / 2 + shadowPadding + clearance;
    return { startOffsetX: Math.ceil(startX - box.x), startOffsetY: 0 };
  }
  const startY = outputHeight - box.height / 2 + rotated.height / 2 + shadowPadding + clearance;
  return { startOffsetX: 0, startOffsetY: Math.ceil(startY - box.y) };
}

function rotatedBounds(width: number, height: number, angleDegrees: number): { readonly width: number; readonly height: number } {
  const radians = angleDegrees * Math.PI / 180;
  return {
    width: Math.ceil(width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians))),
    height: Math.ceil(width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians))),
  };
}

function fitVerticalOverlapRatio(
  rowHeights: readonly number[], minimumRatio: number, maximumStackHeight: number,
): number {
  const overlapCapacity = rowHeights.slice(1).reduce((total, height, index) =>
    total + Math.min(rowHeights[index]!, height), 0);
  if (overlapCapacity === 0) return minimumRatio;
  const requiredOverlap = Math.max(0, rowHeights.reduce((total, height) => total + height, 0) - maximumStackHeight);
  return Math.min(0.96, Math.max(minimumRatio, requiredOverlap / overlapCapacity));
}

function stackHeight(rowHeights: readonly number[], overlapRatio: number): number {
  return rowHeights.reduce((total, height, index) => index === 0 ? height
    : total + height - Math.round(Math.min(rowHeights[index - 1]!, height) * overlapRatio), 0);
}

function splitRows<T>(items: readonly T[], sizes: readonly number[]): readonly (readonly T[])[] {
  let offset = 0;
  return sizes.map((size) => {
    const row = items.slice(offset, offset + size);
    offset += size;
    return row;
  });
}

function appearanceRanks(rowSizes: readonly number[], appearance: "forward" | "reverse"): readonly number[] {
  const rows: number[][] = [];
  let index = 0;
  for (const size of rowSizes) rows.push(Array.from({ length: size }, () => index++));
  const order = appearance === "reverse" ? [...rows].reverse().flat() : rows.flat();
  const ranks = Array.from({ length: index }, () => 0);
  order.forEach((source, rank) => { ranks[source] = rank; });
  return ranks;
}

function stableSeed(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function seededMagnitude(seed: number, materialIndex: number, rowIndex: number): number {
  const unit = seededUnit(seed, materialIndex, rowIndex, 0x9e37_79b9);
  return collageCardAngleMinimumDegrees
    + unit * (collageCardAngleDefaultMaximumDegrees - collageCardAngleMinimumDegrees);
}

function seededSign(seed: number, materialIndex: number, rowIndex: number): -1 | 1 {
  return seededUnit(seed, materialIndex, rowIndex, 0x85eb_ca6b) < 0.5 ? -1 : 1;
}

function seededUnit(seed: number, materialIndex: number, rowIndex: number, salt: number): number {
  let value = (seed ^ Math.imul(materialIndex + 1, salt) ^ Math.imul(rowIndex + 1, 0xc2b2_ae35)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0x1_0000_0000;
}

function roundAngle(value: number): number {
  return Number(value.toFixed(4));
}

function rotationSafeBox(
  box: CollageBox, angleDegrees: number, canvasWidth: number, canvasHeight: number, layoutId: string,
): CollageBox {
  const radians = Math.abs(angleDegrees) * Math.PI / 180;
  const rotatedWidth = Math.ceil(box.width * Math.abs(Math.cos(radians)) + box.height * Math.abs(Math.sin(radians)));
  const rotatedHeight = Math.ceil(box.width * Math.abs(Math.sin(radians)) + box.height * Math.abs(Math.cos(radians)));
  const insetX = Math.ceil((rotatedWidth - box.width) / 2);
  const insetY = Math.ceil((rotatedHeight - box.height) / 2);
  const minimumX = insetX, maximumX = canvasWidth - box.width - insetX;
  const minimumY = insetY, maximumY = canvasHeight - box.height - insetY;
  if (minimumX > maximumX || minimumY > maximumY) {
    throw new DomainError(`collage renderer ${layoutId} cannot fit a card resting at ${angleDegrees} degrees`);
  }
  return {
    ...box,
    x: Math.min(Math.max(box.x, minimumX), maximumX),
    y: Math.min(Math.max(box.y, minimumY), maximumY),
  };
}

function panelRotation(seed: number, index: number): number {
  let value = (seed + Math.imul(index + 1, 2_654_435_761)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  const magnitude = 25 + (value >>> 0) % 21;
  return ((value >>> 8) & 1) === 0 ? magnitude : -magnitude;
}
