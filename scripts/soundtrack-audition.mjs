/**
 * Renders every motif and every groove bar of every style as a short clip, then writes a page that plays them.
 * Nothing here re-implements the engine: each clip is produced by the shipping renderer through
 * `renderSoundtrackStyle`, so rejecting a pattern here rejects exactly what a creator would have heard.
 *
 * Usage: yarn soundtrack:audition [styleId ...]
 */
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  compileSoundtrackStyle, createPcm16WaveHeader, renderSoundtrackStyle, soundtrackPresets,
  soundtrackSampleRate, soundtrackStyleDocuments,
} from "@storyteller/soundtrack";

const run = promisify(execFile);
const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "soundtrack", "audition");
/** Two passes of a phrase is enough to judge a motif and short enough to click through quickly. */
const phraseRepeats = 2;
const grooveBars = 4;

async function main() {
  const wanted = process.argv.slice(2);
  const documents = soundtrackStyleDocuments.filter(({ id }) => !wanted.length || wanted.includes(id));
  if (!documents.length) {
    console.error(`unknown style; available: ${soundtrackStyleDocuments.map(({ id }) => id).join(", ")}`);
    return 1;
  }
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const clips = [];
  for (const document of documents) {
    const barSeconds = (60 / document.bpm) * document.beatsPerBar;
    const melodyLayer = document.melody?.layer;
    const rhythmLayers = document.layers.filter(({ id }) => id !== melodyLayer).map(({ id }) => id);

    for (const [index, motif] of (document.melody?.motifs ?? []).entries()) {
      const seconds = barSeconds * document.melody.phraseBars * phraseRepeats;
      const solo = { ...document, melody: { ...document.melody, motifs: [motif] } };
      for (const [suffix, layers, label] of [
        ["solo", [melodyLayer], "one voice"],
        ["mixed", document.layers.map(({ id }) => id), "over the groove"],
      ]) {
        clips.push(await render({
          document: solo, layers, seconds,
          name: `${document.id}-motif-${index + 1}-${suffix}`,
          style: document.id, group: `Motif ${index + 1}`, label,
          detail: motif.map(([note, at, length]) => `${note} @${at} ×${length}`).join("  "),
        }));
      }
    }

    for (const [index, bar] of document.groove.entries()) {
      clips.push(await render({
        document: { ...document, groove: [bar] }, layers: rhythmLayers, seconds: barSeconds * grooveBars,
        name: `${document.id}-groove-${index + 1}`,
        style: document.id, group: `Groove bar ${index + 1}`, label: "rhythm section only",
        detail: bar.map((hit) => `${hit.layer}${hit.repeat ? `×${hit.repeat.times}` : ""}`).join("  "),
      }));
    }
  }

  await writeFile(join(outputDirectory, "index.html"), page(clips), "utf8");
  console.info(`\n${clips.length} clips in ${outputDirectory}`);
  console.info(`open ${join(outputDirectory, "index.html")}`);
  return 0;
}

async function render({ document, layers, seconds, name, style, group, label, detail }) {
  const frames = Math.round(seconds * soundtrackSampleRate);
  const wav = join(outputDirectory, `${name}.wav`);
  const file = `${name}.m4a`;
  const stream = createWriteStream(wav);
  stream.write(createPcm16WaveHeader(frames));
  await renderSoundtrackStyle({
    style: compileSoundtrackStyle(document), layers, seed: `audition:${name}`, totalSampleFrames: frames,
  }, async (chunk) => {
    if (!stream.write(chunk.preview)) await once(stream, "drain");
  });
  stream.end();
  await once(stream, "finish");
  await run("ffmpeg", ["-y", "-hide_banner", "-v", "error", "-i", wav, "-c:a", "aac", "-b:a", "160k",
    join(outputDirectory, file)]);
  await rm(wav);
  console.info(`  ${name}`);
  return { file, style, group, label, detail, seconds };
}

function page(clips) {
  const styles = [...new Set(clips.map(({ style }) => style))];
  const presetOf = (style) => soundtrackPresets.find((preset) => preset.style.id === style)?.id ?? "—";
  const rows = styles.map((style) => {
    const groups = [...new Set(clips.filter((clip) => clip.style === style).map(({ group }) => group))];
    return `<section><h2>${escape(style)} <small>preset: ${escape(presetOf(style))}</small></h2>${groups.map((group) => {
      const items = clips.filter((clip) => clip.style === style && clip.group === group);
      return `<article>
        <h3>${escape(group)}</h3>
        <p class="detail">${escape(items[0].detail)}</p>
        ${items.map((clip) => `<div class="clip">
          <span>${escape(clip.label)}</span>
          <audio controls preload="none" src="${escape(clip.file)}"></audio>
          <span class="seconds">${clip.seconds.toFixed(1)} s</span>
        </div>`).join("")}
      </article>`;
    }).join("")}</section>`;
  }).join("");
  return `<!doctype html><meta charset="utf-8"><title>Soundtrack audition</title>
<style>
  body { margin: 0; padding: 32px; background: #171714; color: #d9d8cf; font: 14px/1.5 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 32px 0 8px; }
  h2 small { color: #8f8e85; font-weight: 400; }
  h3 { font-size: 13px; margin: 0 0 4px; }
  p.intro { color: #aaa99f; margin: 0 0 8px; max-width: 70ch; }
  article { padding: 12px 14px; margin-bottom: 8px; border: 1px solid #ffffff14; border-radius: 9px; background: #ffffff08; }
  .detail { margin: 0 0 10px; color: #8f8e85; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
  .clip { display: grid; grid-template-columns: 130px 1fr 60px; align-items: center; gap: 12px; margin-top: 6px; }
  .clip span { color: #aaa99f; font-size: 12px; }
  .seconds { text-align: right; font-variant-numeric: tabular-nums; }
  audio { width: 100%; height: 34px; }
</style>
<h1>Soundtrack audition</h1>
<p class="intro">Every clip is rendered by the shipping engine. A motif is played twice on its own and twice over
its groove, because a melody is hard to judge without the harmony underneath it.</p>
${rows}`;
}

function escape(value) {
  return String(value).replace(/[&<>"]/gu, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

process.exitCode = await main();
