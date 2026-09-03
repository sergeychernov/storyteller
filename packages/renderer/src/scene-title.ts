import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  sceneTitleFontPixels, sceneTitleMaximumLines, sceneTitleMaximumWidthRatio, type SceneTitle,
} from "@storyteller/domain";
import sharp from "sharp";

export interface SceneTitleLayerSpec {
  readonly title: SceneTitle;
  readonly width: number;
  readonly height: number;
  readonly outputPath: string;
}

const fontPath = fileURLToPath(new URL("../assets/NotoSans-SemiBold.ttf", import.meta.url));
const embeddedFont = readFileSync(fontPath).toString("base64");

/** Rasterize text once; FFmpeg only composites the resulting alpha layer. */
export async function renderSceneTitleLayer({ title, width, height, outputPath }: SceneTitleLayerSpec): Promise<void> {
  const fontSize = sceneTitleFontPixels[title.size] * width / 1080;
  const maximumWidth = Math.floor(width * sceneTitleMaximumWidthRatio);
  const paddingX = title.style === "plate" ? fontSize * 0.42 : fontSize * 0.12;
  const paddingY = title.style === "plate" ? fontSize * 0.2 : fontSize * 0.12;
  const lineHeight = fontSize * 1.16;
  const lines = wrapTitle(title.text, Math.max(1, Math.floor((maximumWidth - paddingX * 2) / (fontSize * 0.57))));
  const estimatedLineWidths = lines.map((line) => Math.max(fontSize * 0.5, [...line].length * fontSize * 0.57));
  const textWidth = Math.min(maximumWidth - paddingX * 2, Math.max(...estimatedLineWidths));
  const contentWidth = Math.ceil(Math.min(maximumWidth, textWidth + paddingX * 2));
  const contentHeight = Math.ceil(Math.min(height, lines.length * lineHeight + paddingY * 2));
  const centerX = title.position.x * width;
  const centerY = title.position.y * height;
  const left = Math.round(Math.max(0, Math.min(width - contentWidth, centerX - contentWidth / 2)));
  const top = Math.round(Math.max(0, Math.min(height - contentHeight, centerY - contentHeight / 2)));
  const plateColor = title.color === "#20201E" ? "#fffdeb" : "#171714";
  const plateOpacity = title.color === "#20201E" ? 0.86 : 0.81;
  const textY = paddingY + fontSize;
  const tspans = lines.map((line, index) => {
    return `<tspan x="${(contentWidth / 2).toFixed(2)}" y="${(textY + index * lineHeight).toFixed(2)}">${escapeXml(line)}</tspan>`;
  }).join("");
  const shadowColorMatrix = title.color === "#20201E"
    ? "0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .86 0"
    : "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .82 0";
  const shadow = title.style === "shadow" ? `<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">`
    + `<feGaussianBlur in="SourceAlpha" stdDeviation="${Math.max(1, fontSize * 0.07).toFixed(2)}" result="blur"/>`
    + `<feOffset in="blur" dx="${(fontSize * 0.06).toFixed(2)}" dy="${(fontSize * 0.08).toFixed(2)}" result="offset"/>`
    + `<feColorMatrix in="offset" values="${shadowColorMatrix}"/>`
    + `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>` : "";
  const plate = title.style === "plate" ? `<rect width="${contentWidth}" height="${contentHeight}" rx="${(fontSize * 0.18).toFixed(2)}" fill="${plateColor}" fill-opacity="${plateOpacity}"/>` : "";
  const svg = Buffer.from(`<svg width="${contentWidth}" height="${contentHeight}" xmlns="http://www.w3.org/2000/svg">`
    + `<style>@font-face{font-family:TitleFont;src:url(data:font/ttf;base64,${embeddedFont}) format('truetype');}`
    + `text{font-family:TitleFont;font-size:${fontSize.toFixed(2)}px;font-weight:600;text-anchor:middle;}</style>`
    + shadow + plate
    + `<text fill="${title.color}"${title.style === "shadow" ? " filter=\"url(#shadow)\"" : ""}>${tspans}</text></svg>`);
  const fragment = await sharp(svg).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fragment, left, top }]).png().toFile(outputPath);
}

function wrapTitle(text: string, maximumCharacters: number): readonly string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      for (const part of splitWord(word, maximumCharacters)) {
        const candidate = line ? `${line} ${part}` : part;
        if (line && [...candidate].length > maximumCharacters) {
          lines.push(line);
          line = part;
        } else line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  if (lines.length <= sceneTitleMaximumLines) return lines;
  const visible = lines.slice(0, sceneTitleMaximumLines);
  const last = [...visible.at(-1)!];
  visible[visible.length - 1] = `${last.slice(0, Math.max(0, maximumCharacters - 1)).join("").trimEnd()}…`;
  return visible;
}

function splitWord(word: string, maximumCharacters: number): readonly string[] {
  const characters = [...word];
  if (characters.length <= maximumCharacters) return [word];
  return Array.from({ length: Math.ceil(characters.length / maximumCharacters) }, (_, index) =>
    characters.slice(index * maximumCharacters, (index + 1) * maximumCharacters).join(""));
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
