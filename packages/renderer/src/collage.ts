import {
  collageBackgroundTreatment, collageCardShadow, createCollageEntranceSchedule, getCollageCardShadowMetrics, getCollageFrameWidth,
  tornPaperEdgeParameters, tornPaperEdgeSalts, tornPaperEdgeSeed,
  tornPaperInnerEdgeParameters, tornPaperInnerEdgeSalts,
  videoPixelCrop, type CollageSettings, type MaterialEdit,
  defaultStoryFrameRate, frameRateExpression, framesToSeconds, type RationalFrameRate,
} from "@storyteller/domain";
import { dirname, join } from "node:path";
import { probeMedia, type MediaProcessRunner, SpawnMediaProcessRunner } from "./ffmpeg.js";
import { h264SegmentArguments } from "./h264.js";

export const collageRendererVersion = 24;

export interface CollageBackgroundSpec {
  readonly treatment: "darkened" | "original";
  readonly kind: "image" | "video";
  readonly sourcePath: string;
  readonly sourceSize: { readonly width: number; readonly height: number };
  readonly sourceDurationSeconds?: number;
  readonly edit?: MaterialEdit;
}

type CollageSourceSpec = Omit<CollageBackgroundSpec, "treatment">;

export interface CollageRenderSpec {
  readonly background?: CollageBackgroundSpec;
  readonly materials: readonly {
    readonly id: string;
    readonly kind: "image" | "video";
    readonly sourcePath: string;
    /** Decoded source dimensions, before video rotation/crop. */
    readonly sourceSize: { readonly width: number; readonly height: number };
    /** Crop-aware dimensions used to calculate the card aspect. */
    readonly displaySize?: { readonly width: number; readonly height: number };
    readonly sourceDurationSeconds?: number;
    readonly edit?: MaterialEdit;
  }[];
  readonly outputPath: string;
  readonly layoutId: string;
  readonly layoutRendererId: string;
  readonly layoutOverlapRatio: number;
  readonly settings: CollageSettings;
  readonly durationSeconds: number;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly frameRate?: RationalFrameRate;
  readonly durationFrames?: number;
  readonly lossless?: boolean;
  readonly overwrite?: boolean;
  readonly onProgress?: (progress: number) => void;
}

type NormalizedCollageRenderSpec = Required<Omit<CollageRenderSpec, "onProgress">>
  & Pick<CollageRenderSpec, "onProgress"> & { readonly exactFrameCount: boolean };

export function buildCollageBackgroundFilter(spec: CollageRenderSpec): string {
  const normalized = normalizeSpec(spec);
  const { background, width, height } = normalized;
  return `[0:v]${collageSourceFilters(background)}`
    + `scale=${width}:${height}:force_original_aspect_ratio=increase,`
    + `crop=${width}:${height}:(iw-ow)/2:(ih-oh)/2,setsar=1,`
    + (background.treatment === "darkened"
      ? `eq=brightness=${fixed(collageBackgroundTreatment.brightness)}:`
        + `saturation=${fixed(collageBackgroundTreatment.saturation)},`
      : "")
    + "format=rgba[background]";
}

export function buildCollageCardFilter(spec: CollageRenderSpec, materialIndex: number): string {
  const normalized = normalizeSpec(spec);
  const box = createSchedule(normalized)[materialIndex];
  if (!box) throw new Error(`collage material index ${materialIndex} is out of range`);
  const { settings } = normalized;
  const border = Math.min(getCollageFrameWidth(settings.frame), Math.max(0, Math.floor((Math.min(box.width, box.height) - 2) / 2)));
  const innerWidth = box.width - border * 2;
  const innerHeight = box.height - border * 2;
  const material = normalized.materials[materialIndex]!;
  const filters = [
    `[0:v]${collageSourceFilters(material)}`
      + `scale=${innerWidth}:${innerHeight}:force_original_aspect_ratio=decrease,`
      + `pad=${innerWidth}:${innerHeight}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1,format=rgba[photo]`,
    "[photo]null[photo-shape]",
  ];
  const seed = tornPaperEdgeSeed(materialIndex);
  if (border > 0) {
    filters.push(
      `color=c=0x${settings.frame.color.slice(1)}:s=${box.width}x${box.height},format=rgba[frame]`,
      `[frame][photo-shape]overlay=x=${border}:y=${border}:shortest=1:format=auto[card-photo]`,
    );
    if (settings.frame.shape === "torn") {
      const mask = paperEdgeMask(
        innerWidth, innerHeight, seed,
        tornPaperInnerEdgeParameters(settings.frame.width), tornPaperInnerEdgeSalts,
      );
      filters.push(
        `color=c=0x${settings.frame.color.slice(1)}:s=${innerWidth}x${innerHeight},format=rgba[inner-frame-base]`,
        `[inner-frame-base]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(${mask}\,0\,alpha(X,Y))'[inner-frame]`,
        `[card-photo][inner-frame]overlay=x=${border}:y=${border}:shortest=1:format=auto[card-base]`,
      );
    } else {
      filters.push("[card-photo]null[card-base]");
    }
  } else {
    filters.push("[photo-shape]null[card-base]");
  }
  if (settings.frame.shape === "torn") {
    const mask = paperEdgeMask(
      box.width, box.height, seed, tornPaperEdgeParameters(settings.frame.width), tornPaperEdgeSalts,
    );
    filters.push(`[card-base]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(${mask}\,alpha(X,Y)\,0)'[card]`);
  } else {
    filters.push("[card-base]null[card]");
  }
  return filters.join(";");
}

export function buildCollageFilter(spec: CollageRenderSpec): string {
  const normalized = normalizeSpec(spec);
  const { width, height, durationSeconds, materials } = normalized;
  const fps = frameRateExpression(normalized.frameRate);
  const schedule = createSchedule(normalized);
  const filters: string[] = [
    `[0:v]setsar=1,fps=${fps},tpad=stop_mode=clone:stop_duration=${fixed(durationSeconds)},`
      + `trim=duration=${fixed(durationSeconds)},setpts=PTS-STARTPTS,format=rgba[base0]`,
  ];
  const layers = schedule.map((box, index) => ({ box, index }))
    .sort((left, right) => left.box.stackOrder - right.box.stackOrder);
  layers.forEach(({ box, index }, layerIndex) => {
    const holdLastVideoFrame = materials[index]?.kind === "video"
      ? `tpad=stop_mode=clone:stop_duration=${fixed(durationSeconds)},`
      : "";
    filters.push(
      `[${index + 1}:v]setsar=1,fps=${fps},${holdLastVideoFrame}trim=duration=${fixed(durationSeconds)},`
        + `setpts=PTS-STARTPTS,format=rgba[card-shape${index}]`,
    );
    const rotated = rotationCanvas(box.width, box.height, Math.max(
      Math.abs(box.startAngleDegrees), Math.abs(box.finalAngleDegrees),
    ));
    const angle = rotationExpression(
      box.startAngleDegrees, box.finalAngleDegrees, box.startSeconds, box.endSeconds,
    );
    const shadow = getCollageCardShadowMetrics(width);
    const shadowed = { width: rotated.width + shadow.padding * 2, height: rotated.height + shadow.padding * 2 };
    filters.push(
      `[card-shape${index}]rotate=angle='${angle}':ow=${rotated.width}:oh=${rotated.height}:c=0x00000000[card-rotated${index}]`,
      `[card-rotated${index}]split=2[card-front${index}][card-shadow-source${index}]`,
      `[card-front${index}]pad=${shadowed.width}:${shadowed.height}:${shadow.padding}:${shadow.padding}:color=0x00000000[card-front-padded${index}]`,
      `[card-shadow-source${index}]pad=${shadowed.width}:${shadowed.height}:`
        + `${shadow.padding + shadow.offsetX}:${shadow.padding + shadow.offsetY}:color=0x00000000,`
        + `colorchannelmixer=rr=0:gg=0:bb=0:aa=${fixed(collageCardShadow.opacity)},`
        + `boxblur=lr=0:lp=1:cr=0:cp=1:ar=${Math.max(1, Math.round(shadow.blurSigma))}:ap=2[card-shadow${index}]`,
      `[card-shadow${index}][card-front-padded${index}]overlay=x=0:y=0:shortest=1:format=auto[card${index}]`,
    );
    const target = {
      x: box.x - Math.ceil((rotated.width - box.width) / 2) - shadow.padding,
      y: box.y - Math.ceil((rotated.height - box.height) / 2) - shadow.padding,
    };
    const position = motionExpression(box, target);
    const enable = box.startSeconds > 0 ? `:enable='gte(t\,${fixed(box.startSeconds)})'` : "";
    filters.push(
      `[base${layerIndex}][card${index}]overlay=x='${position.x}':y='${position.y}':eval=frame${enable}:`
        + `shortest=1:eof_action=pass:format=auto[base${layerIndex + 1}]`,
    );
  });
  filters.push(`[base${materials.length}]trim=duration=${fixed(durationSeconds)},setpts=PTS-STARTPTS,format=yuv420p[v0]`);
  return filters.join(";");
}

export async function renderCollage(
  spec: CollageRenderSpec,
  runner: MediaProcessRunner = new SpawnMediaProcessRunner(),
): Promise<unknown> {
  const normalized = normalizeSpec(spec);
  let lastProgress = 0;
  const reportProgress = (value: number) => {
    const next = Math.max(lastProgress, Math.min(1, value));
    if (next === lastProgress && next !== 0) return;
    lastProgress = next;
    normalized.onProgress?.(next);
  };
  reportProgress(0);
  const originalBackground = normalized.background.treatment === "original";
  const backgroundVideo = normalized.background.kind === "video";
  const movingBackground = originalBackground && backgroundVideo;
  const backgroundPath = join(dirname(normalized.outputPath), `.collage-background.${movingBackground ? "mkv" : "png"}`);
  const backgroundSegment = backgroundVideo ? collageVideoSegment(normalized.background) : undefined;
  const backgroundInput = backgroundVideo ? [
    ...(backgroundSegment!.startSeconds > 0 ? ["-ss", fixed(backgroundSegment!.startSeconds)] : []),
    "-i", normalized.background.sourcePath,
    ...(movingBackground && backgroundSegment!.durationSeconds !== undefined
      ? ["-t", fixed(backgroundSegment!.durationSeconds)] : []),
  ] : ["-i", normalized.background.sourcePath];
  const backgroundOutput = movingBackground
    ? ["-an", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "yuv444p", backgroundPath]
    : ["-frames:v", "1", "-update", "1", backgroundPath];
  const backgroundResult = await runner.run("ffmpeg", [
    normalized.overwrite ? "-y" : "-n", "-v", "error", ...backgroundInput,
    "-filter_complex", buildCollageBackgroundFilter(normalized), "-map", "[background]",
    ...backgroundOutput,
  ], undefined, movingBackground ? {
    durationSeconds: backgroundSegment?.durationSeconds ?? normalized.durationSeconds,
    onProgress: (progress) => reportProgress(progress * 0.1),
  } : undefined);
  if (backgroundResult.exitCode !== 0) {
    const termination = backgroundResult.signal ? `signal ${backgroundResult.signal}` : `exit ${backgroundResult.exitCode}`;
    throw new Error(`ffmpeg collage background failed (${termination}): ${backgroundResult.stderr.trim()}`);
  }
  reportProgress(0.1);
  const cardProgress = normalized.materials.map(() => 0);
  const reportCardProgress = (index: number, progress: number) => {
    cardProgress[index] = Math.max(cardProgress[index] ?? 0, Math.min(1, progress));
    reportProgress(0.1 + cardProgress.reduce((sum, value) => sum + value, 0) / cardProgress.length * 0.4);
  };
  const cards = await Promise.all(normalized.materials.map(async (material, index) => {
    const video = material.kind === "video";
    const cardPath = join(dirname(normalized.outputPath), `.collage-card-${index}.${video ? "mkv" : "png"}`);
    const segment = video ? collageVideoSegment(material) : undefined;
    const input = video ? [
      ...(segment!.startSeconds > 0 ? ["-ss", fixed(segment!.startSeconds)] : []),
      "-i", material.sourcePath,
      ...(segment!.durationSeconds === undefined ? [] : ["-t", fixed(segment!.durationSeconds)]),
    ] : ["-i", material.sourcePath];
    const output = video
      ? ["-an", "-c:v", "ffv1", "-level", "3", "-pix_fmt", "yuva444p", cardPath]
      : ["-frames:v", "1", "-update", "1", cardPath];
    const result = await runner.run("ffmpeg", [
      normalized.overwrite ? "-y" : "-n", "-v", "error", ...input,
      "-filter_complex", buildCollageCardFilter(normalized, index), "-map", "[card]", ...output,
    ], undefined, video && segment?.durationSeconds ? {
      durationSeconds: segment.durationSeconds,
      onProgress: (progress) => reportCardProgress(index, progress),
    } : undefined);
    if (result.exitCode !== 0) {
      const termination = result.signal ? `signal ${result.signal}` : `exit ${result.exitCode}`;
      throw new Error(`ffmpeg collage card ${index + 1} failed (${termination}): ${result.stderr.trim()}`);
    }
    reportCardProgress(index, 1);
    return { path: cardPath, kind: material.kind };
  }));
  const backgroundArguments = movingBackground
    ? ["-i", backgroundPath]
    : ["-loop", "1", "-t", fixed(normalized.durationSeconds), "-i", backgroundPath];
  const inputArguments = [...backgroundArguments,
    ...cards.flatMap((card) => card.kind === "video"
    ? ["-i", card.path]
    : ["-loop", "1", "-t", fixed(normalized.durationSeconds), "-i", card.path])];
  const result = await runner.run("ffmpeg", [
    normalized.overwrite ? "-y" : "-n", "-v", "error", "-filter_threads", "2", "-filter_complex_threads", "2",
    ...inputArguments,
    "-filter_complex", buildCollageFilter(normalized), "-map", "[v0]", "-an",
    ...h264SegmentArguments(normalized.frameRate, normalized.lossless, normalized.exactFrameCount ? 1 : 2),
    ...(normalized.exactFrameCount ? ["-frames:v", String(normalized.durationFrames)] : []), normalized.outputPath,
  ], undefined, {
    durationSeconds: normalized.durationSeconds,
    onProgress: (progress) => reportProgress(0.5 + progress * 0.5),
  });
  if (result.exitCode !== 0) {
    const termination = result.signal ? `signal ${result.signal}` : `exit ${result.exitCode}`;
    throw new Error(`ffmpeg collage failed (${termination}): ${result.stderr.trim()}`);
  }
  reportProgress(1);
  return probeMedia(normalized.outputPath, runner);
}

function createSchedule(spec: NormalizedCollageRenderSpec) {
  return createCollageEntranceSchedule({
    layoutId: spec.layoutId,
    layoutRendererId: spec.layoutRendererId,
    layoutOverlapRatio: spec.layoutOverlapRatio,
    materials: spec.materials.map(({ id, kind, sourceSize, displaySize }) => ({ id, kind, ...(displaySize ?? sourceSize) })),
    width: spec.width,
    height: spec.height,
    settings: spec.settings,
  });
}

function normalizeSpec(spec: CollageRenderSpec): NormalizedCollageRenderSpec {
  const width = spec.width ?? 1080;
  const height = spec.height ?? 1920;
  const frameRate = spec.frameRate ?? (spec.fps ? { numerator: spec.fps, denominator: 1 } : defaultStoryFrameRate);
  const fps = spec.fps ?? frameRate.numerator / frameRate.denominator;
  const durationFrames = spec.durationFrames ?? Math.max(1, Math.round(spec.durationSeconds * fps));
  const durationSeconds = spec.durationFrames !== undefined ? framesToSeconds(durationFrames, frameRate) : spec.durationSeconds;
  const overwrite = spec.overwrite ?? false;
  const lossless = spec.lossless ?? false;
  const fallback = spec.materials[0];
  const background = spec.background ?? (fallback ? { ...fallback, treatment: "darkened" as const } : undefined);
  if (spec.materials.length < 2 || spec.materials.length > 6) throw new Error("a collage requires 2 to 6 media cards");
  if (!background) throw new Error("a collage background source is required");
  if (![width, height, fps, spec.durationSeconds, background.sourceSize.width, background.sourceSize.height,
    ...spec.materials.flatMap(({ sourceSize, displaySize }) => [
    sourceSize.width, sourceSize.height, ...(displaySize ? [displaySize.width, displaySize.height] : []),
  ])]
    .every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("collage source size, output size, fps and duration must be positive");
  }
  return { ...spec, background, width, height, fps, frameRate, durationFrames, durationSeconds,
    exactFrameCount: spec.durationFrames !== undefined, overwrite, lossless };
}

function collageSourceFilters(material: CollageSourceSpec): string {
  if (material.kind !== "video") return "";
  const edit = material.edit ?? { rotation: 0, crop: { x: 0, y: 0, width: 1, height: 1 } };
  const crop = videoPixelCrop(material.sourceSize.width, material.sourceSize.height, edit);
  const rotation = edit.rotation === 90 ? ["transpose=clock"]
    : edit.rotation === 180 ? ["hflip", "vflip"] : edit.rotation === 270 ? ["transpose=cclock"] : [];
  return [...rotation, `crop=${crop.width}:${crop.height}:${crop.left}:${crop.top}`, "setsar=1"].join(",") + ",";
}

function collageVideoSegment(material: CollageSourceSpec): {
  readonly startSeconds: number; readonly durationSeconds?: number;
} {
  const startSeconds = material.edit?.trim?.startSeconds ?? 0;
  const endSeconds = material.edit?.trim?.endSeconds ?? material.sourceDurationSeconds;
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || endSeconds !== undefined
    && (!Number.isFinite(endSeconds) || endSeconds <= startSeconds
      || material.sourceDurationSeconds !== undefined && endSeconds > material.sourceDurationSeconds + 0.001)) {
    throw new Error("collage video trim must be within the source duration");
  }
  return {
    startSeconds,
    ...(endSeconds === undefined ? {} : { durationSeconds: endSeconds - startSeconds }),
  };
}

function paperEdgeMask(
  width: number,
  height: number,
  seed: number,
  parameters: { readonly variation: number; readonly step: number },
  salts: Readonly<Record<"top" | "right" | "bottom" | "left", number>>,
): string {
  const { variation, step } = parameters;
  const edge = (axis: "X" | "Y", salt: number) => paperEdgeOffsetExpression(axis, seed, salt, variation, step);
  const expression = `gte(X,${edge("Y", salts.left)})*lt(X,${width}-${edge("Y", salts.right)})`
    + `*gte(Y,${edge("X", salts.top)})*lt(Y,${height}-${edge("X", salts.bottom)})`;
  return escapeExpression(expression);
}

function paperEdgeOffsetExpression(axis: "X" | "Y", seed: number, salt: number, variation: number, step: number): string {
  const segment = `floor(${axis}/${step})`;
  const progress = `mod(${axis},${step})/${step}`;
  const noise = (index: string) => `${variation}*mod(abs(sin(((${index})+${seed * salt})*12.9898+${(salt * 78.233).toFixed(3)})`
    + `*43758.5453),1)`;
  return `(${noise(segment)}*(1-${progress})+${noise(`(${segment}+1)`)}*${progress})`;
}

function rotationExpression(startAngleDegrees: number, finalAngleDegrees: number, start: number, end: number): string {
  const startRadians = startAngleDegrees * Math.PI / 180;
  const finalRadians = finalAngleDegrees * Math.PI / 180;
  if (end <= start) return finalRadians.toFixed(8);
  const progress = `(t-${fixed(start)})/${fixed(end - start)}`;
  const eased = `(1-pow(1-(${progress}),3))`;
  const expression = `if(lt(t,${fixed(start)}),${startRadians.toFixed(8)},if(lt(t,${fixed(end)}),`
    + `${startRadians.toFixed(8)}+(${finalRadians.toFixed(8)}-${startRadians.toFixed(8)})*${eased},`
    + `${finalRadians.toFixed(8)}))`;
  return escapeExpression(expression);
}

function rotationCanvas(width: number, height: number, angleDegrees: number): { readonly width: number; readonly height: number } {
  const radians = angleDegrees * Math.PI / 180;
  return {
    width: Math.max(width, Math.ceil(width * Math.abs(Math.cos(radians)) + height * Math.abs(Math.sin(radians)))),
    height: Math.max(height, Math.ceil(width * Math.abs(Math.sin(radians)) + height * Math.abs(Math.cos(radians)))),
  };
}

function motionExpression(
  entrance: ReturnType<typeof createCollageEntranceSchedule>[number],
  target: { readonly x: number; readonly y: number },
): { readonly x: string; readonly y: string } {
  const { startSeconds: start, endSeconds: end, direction } = entrance;
  if (end <= start) return { x: String(target.x), y: String(target.y) };
  const progress = `(t-${fixed(start)})/${fixed(end - start)}`;
  const eased = `(1-pow(1-(${progress}),3))`;
  const startX = target.x + entrance.startOffsetX;
  const startY = target.y + entrance.startOffsetY;
  if (direction === "left") return {
    x: escapeExpression(`if(lt(t,${fixed(start)}),${startX},if(lt(t,${fixed(end)}),`
      + `${startX}+(${target.x - startX})*${eased},${target.x}))`),
    y: String(target.y),
  };
  if (direction === "right") return {
    x: escapeExpression(`if(lt(t,${fixed(start)}),${startX},if(lt(t,${fixed(end)}),`
      + `${startX}-(${startX - target.x})*${eased},${target.x}))`),
    y: String(target.y),
  };
  return {
    x: String(target.x),
    y: escapeExpression(`if(lt(t,${fixed(start)}),${startY},if(lt(t,${fixed(end)}),`
      + `${startY}-(${startY - target.y})*${eased},${target.y}))`),
  };
}

function escapeExpression(expression: string): string {
  return expression.replaceAll(",", "\\,");
}

function fixed(value: number): string {
  return value.toFixed(3);
}
