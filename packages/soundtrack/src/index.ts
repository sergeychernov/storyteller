import { createHash } from "node:crypto";
import {
  createRandom, Fade, Reverb, Ring, soundtrackChannels, soundtrackSampleRate, toPcm16,
} from "./audio.js";
import { timbres } from "./instruments.js";
import { planScore, type Score, type SoundtrackStyle, type Voice } from "./score.js";
import { soundtrackStyles } from "./styles/index.js";

export { soundtrackChannels, soundtrackSampleRate } from "./audio.js";
export { timbreIds, type TimbreId } from "./instruments.js";
export { compileSoundtrackStyle, planScore } from "./score.js";
export type {
  BarContext, Chord, Hit, MelodyPlan, MotifNote, Score, SoundtrackStemId, SoundtrackStyle, Span, StyleLayer,
} from "./score.js";
export { parseStyleDocument, styleDocumentSchema, type StyleDocument } from "./style-document.js";
export { soundtrackStyleDocuments, soundtrackStyles } from "./styles/index.js";

export const soundtrackEngineId = "storyteller-procedural";
export const soundtrackEngineVersion = 5;
export const soundtrackLicenseVersion = "storyteller-generated-music-1.0";
export const maximumSoundtrackDurationSeconds = 180;
export const maximumMelodyVariant = 99;
export const soundtrackStemIds = ["rhythm", "melody"] as const;
export const soundtrackPresetIds = ["road", "lounge", "dnb"] as const;
export type SoundtrackPresetId = typeof soundtrackPresetIds[number];

export interface SoundtrackPresetSummary {
  readonly id: SoundtrackPresetId;
  readonly version: 1;
  readonly bpm: number;
  readonly default: boolean;
}

export interface SoundtrackPresetDefinition extends SoundtrackPresetSummary {
  readonly style: SoundtrackStyle;
  /** Layers of the style this preset plays; everything else in the groove stays silent. */
  readonly layers: readonly string[];
}

/**
 * A preset is what a creator picks, a style is what the music is: `road` is a mood the product offers, `pentatonic`
 * is the D major pentatonic score it plays. Keeping the two id spaces apart lets either be renamed on its own.
 */
const presetStyles = [
  { id: "road", styleId: "pentatonic", default: true },
  { id: "lounge", styleId: "lounge", default: false },
  { id: "dnb", styleId: "dnb", default: false },
] as const satisfies readonly { id: SoundtrackPresetId; styleId: string; default: boolean }[];

export const soundtrackPresets: readonly SoundtrackPresetDefinition[] = presetStyles.map(({ id, styleId, default: selected }) => {
  const style = soundtrackStyles.find((candidate) => candidate.id === styleId);
  if (!style) throw new Error(`preset ${id} names unknown style ${styleId}`);
  if (style.version !== 1) throw new Error(`style ${style.id} declares an unsupported version`);
  return { id, version: 1, bpm: style.bpm, default: selected, style, layers: style.layers.map((layer) => layer.id) };
});

export interface SoundtrackPcmChunk {
  /** Stereo signed 16-bit little-endian PCM. */
  readonly rhythm: Buffer;
  readonly melody: Buffer;
  readonly preview: Buffer;
  readonly sampleFrames: number;
}

export interface GenerateSoundtrackInput {
  readonly presetId: SoundtrackPresetId;
  readonly presetVersion: 1;
  readonly seed: string;
  readonly totalSampleFrames: number;
  /** Rotates the melodic material over an unchanged rhythm section, so a creator can ask for another melody. */
  readonly melodyVariant?: number;
  readonly blockSampleFrames?: number;
}

export interface SoundtrackGenerationSummary {
  readonly totalSampleFrames: number;
  readonly sampleRate: typeof soundtrackSampleRate;
  readonly channels: typeof soundtrackChannels;
  readonly previewPeak: number;
  readonly rhythmPeak: number;
  readonly melodyPeak: number;
  readonly voices: number;
}

export function getSoundtrackPreset(id: string): SoundtrackPresetDefinition | undefined {
  return soundtrackPresets.find((preset) => preset.id === id);
}

/**
 * Renders reproducible PCM in bounded blocks without files, network, FFmpeg, samples, or model weights.
 * The score is planned once as note events on a single global timeline, then rendered twice: the first pass
 * measures the stem peaks that per-stem normalisation needs, the second writes the PCM.
 */
export async function generateSoundtrack(
  input: GenerateSoundtrackInput,
  write: (chunk: SoundtrackPcmChunk) => void | Promise<void>,
  reportProgress?: (value: number) => void,
): Promise<SoundtrackGenerationSummary> {
  const preset = getSoundtrackPreset(input.presetId);
  if (!preset || preset.version !== input.presetVersion) throw new Error("unsupported soundtrack preset version");
  if (!Number.isSafeInteger(input.totalSampleFrames) || input.totalSampleFrames <= 0
    || input.totalSampleFrames > maximumSoundtrackDurationSeconds * soundtrackSampleRate) {
    throw new Error("soundtrack duration must be between one sample and 180 seconds");
  }
  const blockFrames = input.blockSampleFrames ?? 4_096;
  if (!Number.isSafeInteger(blockFrames) || blockFrames < 256 || blockFrames > 65_536) throw new Error("invalid PCM block size");

  const melodyVariant = input.melodyVariant ?? 0;
  if (!Number.isSafeInteger(melodyVariant) || melodyVariant < 0 || melodyVariant > maximumMelodyVariant) {
    throw new Error("melody variant must be between 0 and 99");
  }
  return renderSoundtrackStyle({
    style: { ...preset.style, bpm: preset.bpm }, layers: preset.layers, seed: input.seed,
    totalSampleFrames: input.totalSampleFrames, melodyVariant, blockSampleFrames: blockFrames,
  }, write, reportProgress);
}

export interface RenderSoundtrackStyleInput {
  readonly style: SoundtrackStyle;
  readonly layers: readonly string[];
  readonly seed: string;
  readonly totalSampleFrames: number;
  readonly melodyVariant?: number;
  readonly blockSampleFrames?: number;
}

/**
 * Renders any style, not only the ones a preset exposes. This is what an audition tool or a preset editor
 * preview uses, so what a reviewer hears is produced by the shipping renderer rather than a second one.
 */
export async function renderSoundtrackStyle(
  input: RenderSoundtrackStyleInput,
  write: (chunk: SoundtrackPcmChunk) => void | Promise<void>,
  reportProgress?: (value: number) => void,
): Promise<SoundtrackGenerationSummary> {
  const blockFrames = input.blockSampleFrames ?? 4_096;
  const score = planScore({
    style: input.style, enabledLayers: new Set(input.layers),
    seed: seedNumber(input.seed), totalFrames: input.totalSampleFrames, melodyVariant: input.melodyVariant ?? 0,
  });
  const measured = await renderScore(score, blockFrames, undefined, (value) => reportProgress?.(value * 0.5));
  const scales = {
    rhythm: measured.rhythmPeak > 0 ? rhythmPeakTarget / measured.rhythmPeak : 1,
    melody: measured.melodyPeak > 0 ? melodyPeakTarget / measured.melodyPeak : 1,
  };
  const written = await renderScore(score, blockFrames, { scales, write }, (value) => reportProgress?.(0.5 + value * 0.5));
  return {
    totalSampleFrames: score.totalFrames, sampleRate: soundtrackSampleRate, channels: soundtrackChannels,
    previewPeak: written.previewPeak, rhythmPeak: written.rhythmPeak, melodyPeak: written.melodyPeak,
    voices: score.voices.length,
  };
}

export function createPcm16WaveHeader(totalSampleFrames: number): Buffer {
  if (!Number.isSafeInteger(totalSampleFrames) || totalSampleFrames <= 0) throw new Error("invalid WAV sample length");
  const dataBytes = totalSampleFrames * soundtrackChannels * 2;
  if (dataBytes > 0xffff_ffff - 36) throw new Error("WAV exceeds RIFF size limit");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(soundtrackChannels, 22);
  header.writeUInt32LE(soundtrackSampleRate, 24);
  header.writeUInt32LE(soundtrackSampleRate * soundtrackChannels * 2, 28);
  header.writeUInt16LE(soundtrackChannels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

const rhythmPeakTarget = 0.64;
const melodyPeakTarget = 0.56;
const previewMixGain = 1.08;
const previewRhythmGain = 0.88;
const previewMelodyGain = 0.92;
/** Keeps the limited mix near the stem-normalised loudness target while `tanh` keeps it provably below full scale. */
const previewScale = 0.78 / Math.tanh(
  Math.hypot(previewRhythmGain * rhythmPeakTarget, previewMelodyGain * melodyPeakTarget) * previewMixGain,
);

interface RenderSink {
  readonly scales: { readonly rhythm: number; readonly melody: number };
  readonly write: (chunk: SoundtrackPcmChunk) => void | Promise<void>;
}

async function renderScore(
  score: Score,
  blockFrames: number,
  sink: RenderSink | undefined,
  reportProgress: (value: number) => void,
): Promise<{ rhythmPeak: number; melodyPeak: number; previewPeak: number }> {
  const rhythmRing = new Ring(blockFrames + score.maximumVoiceFrames + 1);
  const melodyRing = new Ring(blockFrames + score.maximumVoiceFrames + 1);
  const rhythmReverb = new Reverb(score.reverb.rhythm);
  const melodyReverb = new Reverb(score.reverb.melody);
  const scratch = new Float64Array(score.maximumVoiceFrames);
  const rhythmFade = new Fade(score.totalFrames, 0.1, 1.2);
  const melodyFade = new Fade(score.totalFrames, 0.12, 1.5);
  const previewFade = new Fade(score.totalFrames, 0.08, 1.4);
  let rhythmPeak = 0;
  let melodyPeak = 0;
  let previewPeak = 0;
  let next = 0;

  for (let offset = 0; offset < score.totalFrames; offset += blockFrames) {
    const frames = Math.min(blockFrames, score.totalFrames - offset);
    while (next < score.voices.length && score.voices[next]!.startFrame < offset + frames) {
      const voice = score.voices[next]!;
      renderVoice(voice, voice.melody ? melodyRing : rhythmRing, score.totalFrames, scratch);
      next += 1;
    }
    const rhythm = sink && Buffer.allocUnsafe(frames * soundtrackChannels * 2);
    const melody = sink && Buffer.allocUnsafe(frames * soundtrackChannels * 2);
    const preview = sink && Buffer.allocUnsafe(frames * soundtrackChannels * 2);
    for (let local = 0; local < frames; local += 1) {
      const frame = offset + local;
      const rhythmDry = rhythmRing.take(frame);
      const melodyDry = melodyRing.take(frame);
      const rhythmFactor = rhythmFade.at(frame);
      const melodyFactor = melodyFade.at(frame);
      rhythmReverb.process(rhythmDry[0], rhythmDry[1]);
      melodyReverb.process(melodyDry[0], melodyDry[1]);
      let rhythmLeft = rhythmReverb.left * rhythmFactor;
      let rhythmRight = rhythmReverb.right * rhythmFactor;
      let melodyLeft = melodyReverb.left * melodyFactor;
      let melodyRight = melodyReverb.right * melodyFactor;
      rhythmPeak = Math.max(rhythmPeak, Math.abs(rhythmLeft), Math.abs(rhythmRight));
      melodyPeak = Math.max(melodyPeak, Math.abs(melodyLeft), Math.abs(melodyRight));
      if (!sink) continue;
      rhythmLeft *= sink.scales.rhythm;
      rhythmRight *= sink.scales.rhythm;
      melodyLeft *= sink.scales.melody;
      melodyRight *= sink.scales.melody;
      const previewFactor = previewFade.at(frame) * previewScale;
      const previewLeft = Math.tanh((previewRhythmGain * rhythmLeft + previewMelodyGain * melodyLeft) * previewMixGain) * previewFactor;
      const previewRight = Math.tanh((previewRhythmGain * rhythmRight + previewMelodyGain * melodyRight) * previewMixGain) * previewFactor;
      previewPeak = Math.max(previewPeak, Math.abs(previewLeft), Math.abs(previewRight));
      const byteOffset = local * 4;
      rhythm!.writeInt16LE(toPcm16(rhythmLeft), byteOffset);
      rhythm!.writeInt16LE(toPcm16(rhythmRight), byteOffset + 2);
      melody!.writeInt16LE(toPcm16(melodyLeft), byteOffset);
      melody!.writeInt16LE(toPcm16(melodyRight), byteOffset + 2);
      preview!.writeInt16LE(toPcm16(previewLeft), byteOffset);
      preview!.writeInt16LE(toPcm16(previewRight), byteOffset + 2);
    }
    if (sink) await sink.write({ rhythm: rhythm!, melody: melody!, preview: preview!, sampleFrames: frames });
    reportProgress((offset + frames) / score.totalFrames);
  }
  return {
    rhythmPeak: sink ? rhythmPeak * sink.scales.rhythm : rhythmPeak,
    melodyPeak: sink ? melodyPeak * sink.scales.melody : melodyPeak,
    previewPeak,
  };
}

function renderVoice(voice: Voice, target: Ring, totalFrames: number, scratch: Float64Array): void {
  const limit = Math.min(voice.frames, totalFrames - voice.startFrame);
  if (limit <= 0) return;
  timbres[voice.timbre]({
    frames: voice.frames, limit, frequency: voice.frequency, variant: voice.variant, scratch,
    random: createRandom(voice.seed),
    emit(index, mono) {
      const value = mono * voice.level;
      target.add(voice.startFrame + index, value * voice.left, value * voice.right);
    },
  });
}

function seedNumber(seed: string): number {
  return createHash("sha256").update(seed).digest().readUInt32LE(0);
}
