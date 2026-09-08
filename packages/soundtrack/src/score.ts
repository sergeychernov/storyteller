import { createRandom, mixSeed, noteFrequency, panGains, soundtrackSampleRate } from "./audio.js";
import type { TimbreId } from "./instruments.js";
import {
  parseStyleDocument, type ChordDocument, type HitDocument, type MelodyPlanDocument, type SpanDocument,
  type StyleLayerDocument,
} from "./style-document.js";

export type SoundtrackStemId = "rhythm" | "melody";
/** The editable shapes are the runtime shapes; only `when` is compiled from data into a predicate. */
export type Span = SpanDocument;
export type Chord = ChordDocument;
export type StyleLayer = StyleLayerDocument;
export type MelodyPlan = MelodyPlanDocument;
export type MotifNote = MelodyPlan["motifs"][number][number];

export interface BarContext {
  readonly index: number;
  readonly climaxBar: number;
  readonly bars: number;
}

/** One sounding event. Repeats and cycled values are already expanded, so the planner reads plain numbers. */
export interface Hit {
  readonly layer: string;
  readonly at: Span;
  readonly duration: Span;
  readonly pitch?: { readonly from: "tones" | "bass"; readonly index: number };
  readonly pan: number;
  readonly gain?: number;
  readonly flat?: boolean;
  readonly variant?: number;
  readonly when?: (context: BarContext) => boolean;
}

export interface SoundtrackStyle {
  readonly id: string;
  readonly version: number;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly swing: number;
  readonly swingUnitBeats: number;
  /** Chord names are resolved once, so the planner never looks anything up by name. */
  readonly progression: readonly Chord[];
  readonly groove: readonly (readonly Hit[])[];
  readonly layers: readonly StyleLayer[];
  readonly melody?: MelodyPlan;
  readonly reverb: { readonly rhythm: number; readonly melody: number };
}

/** Validates an editable style document and resolves the parts the planner needs ready to use. */
export function compileSoundtrackStyle(value: unknown): SoundtrackStyle {
  const document = parseStyleDocument(value);
  return {
    id: document.id, version: document.version, bpm: document.bpm,
    beatsPerBar: document.beatsPerBar, swing: document.swing, swingUnitBeats: document.swingUnitBeats,
    progression: document.progression.map((name) => document.chords[name]!),
    groove: document.groove.map((bar) => bar.flatMap(expandHit)),
    layers: document.layers,
    ...(document.melody ? { melody: document.melody } : {}),
    reverb: document.reverb,
  };
}

/** Expands one written hit into the events it stands for, in the order the style wrote them. */
function expandHit(hit: HitDocument): Hit[] {
  const when = compileWindow(hit.when);
  return Array.from({ length: hit.repeat?.times ?? 1 }, (_unused, step) => ({
    layer: hit.layer,
    at: shift(hit.at, hit.repeat?.every, step),
    duration: hit.duration,
    ...(hit.pitch ? { pitch: { from: hit.pitch.from, index: cycle(hit.pitch.index, step) } } : {}),
    pan: cycle(hit.pan, step),
    ...(hit.gain === undefined ? {} : { gain: cycle(hit.gain, step) }),
    ...(hit.flat === undefined ? {} : { flat: hit.flat }),
    ...(hit.variant === undefined ? {} : { variant: cycle(hit.variant, step) }),
    ...(when ? { when } : {}),
  }));
}

function compileWindow(window: HitDocument["when"]): Hit["when"] {
  if (!window) return undefined;
  const fromBar = window.fromBar ?? 0;
  const fraction = window.fromClimaxFraction ?? 0;
  return ({ index, climaxBar }) => index >= Math.max(fromBar, Math.floor(climaxBar * fraction));
}

function cycle(value: number | readonly number[], step: number): number {
  return typeof value === "number" ? value : value[step % value.length]!;
}

/** Multiplies rather than accumulates, so the hundredth step of a groove lands where the style says it does. */
function shift(at: Span, every: Span | undefined, step: number): Span {
  if (!every || step === 0) return at;
  return { beats: (at.beats ?? 0) + (every.beats ?? 0) * step, seconds: (at.seconds ?? 0) + (every.seconds ?? 0) * step };
}

export interface Voice {
  readonly timbre: TimbreId;
  readonly melody: boolean;
  readonly startFrame: number;
  readonly frames: number;
  readonly frequency: number;
  readonly level: number;
  readonly left: number;
  readonly right: number;
  readonly variant: number;
  readonly seed: number;
}

export interface Score {
  readonly totalFrames: number;
  readonly voices: readonly Voice[];
  readonly maximumVoiceFrames: number;
  readonly reverb: { readonly rhythm: number; readonly melody: number };
}

export interface PlanScoreInput {
  readonly style: SoundtrackStyle;
  readonly enabledLayers: ReadonlySet<string>;
  readonly seed: number;
  readonly totalFrames: number;
  readonly melodyVariant: number;
}

/** Lays the style out on one global timeline from t=0; nothing restarts at a scene or block boundary. */
export function planScore({ style, enabledLayers, seed, totalFrames, melodyVariant }: PlanScoreInput): Score {
  const duration = totalFrames / soundtrackSampleRate;
  const beat = 60 / style.bpm;
  const bar = beat * style.beatsPerBar;
  const bars = Math.max(1, Math.ceil(duration / bar));
  const climaxSeconds = duration * 0.72;
  const climaxBar = Math.min(bars - 1, Math.max(0, Math.floor(climaxSeconds / bar)));
  const layers = new Map(style.layers.map((layer, index) => [layer.id, { ...layer, index }]));
  const voices: Voice[] = [];
  const span = (value: Span) => (value.beats ?? 0) * beat + (value.seconds ?? 0);
  const push = (
    layerId: string, startSeconds: number, durationSeconds: number,
    note: string | undefined, level: number, pan: number, variant: number, voiceSeed: number, voiceKey: number,
  ) => {
    const layer = layers.get(layerId);
    if (!layer) throw new Error(`style ${style.id} has no layer ${layerId}`);
    const startFrame = Math.max(0, Math.round(startSeconds * soundtrackSampleRate));
    if (startFrame >= totalFrames) return;
    const [left, right] = panGains(pan);
    voices.push({
      timbre: layer.timbre, melody: layer.stem === "melody", startFrame,
      frames: Math.max(2, Math.round(durationSeconds * soundtrackSampleRate)),
      frequency: note ? noteFrequency(note) : 0, level, left, right, variant,
      seed: mixSeed(voiceSeed, voiceKey),
    });
  };

  for (let index = 0; index < bars; index += 1) {
    const start = index * bar;
    const chord = style.progression[index % style.progression.length]!;
    const context: BarContext = { index, climaxBar, bars };
    const occurrences = new Map<string, number>();
    const distance = Math.abs(index - climaxBar);
    const energy = index < climaxBar ? 0.58 + 0.24 * (index / Math.max(1, climaxBar))
      : index === climaxBar ? 1 : Math.max(0.72, 1 - 0.08 * distance);
    for (const hit of style.groove[index % style.groove.length]!) {
      if (!enabledLayers.has(hit.layer)) continue;
      if (hit.when && !hit.when(context)) continue;
      const note = hit.pitch
        ? (hit.pitch.from === "tones" ? chord.tones : chord.bass)[hit.pitch.index]
        : undefined;
      if (hit.pitch && note === undefined) throw new Error(`style ${style.id} chord is missing ${hit.pitch.from} ${hit.pitch.index}`);
      const occurrence = occurrences.get(hit.layer) ?? 0;
      occurrences.set(hit.layer, occurrence + 1);
      push(hit.layer, start + swung(span(hit.at), beat, style), span(hit.duration), note,
        (hit.flat ? 1 : energy) * (hit.gain ?? 1), hit.pan, hit.variant ?? 0, seed,
        voiceKey(layers.get(hit.layer)?.index ?? 0, index, occurrence));
    }
  }

  const melody = style.melody;
  if (melody && enabledLayers.has(melody.layer) && melody.motifs.length) {
    const melodySeed = mixSeed(seed, 0x5eed + melodyVariant);
    const phraseSeconds = melody.phraseBars * bar;
    const phrases = Math.max(1, Math.ceil(bars / melody.phraseBars));
    const climaxPhrase = Math.min(phrases - 1, Math.max(0, Math.floor(climaxSeconds / phraseSeconds)));
    let previousMotif = -1;
    for (let phrase = 0; phrase < phrases; phrase += 1) {
      const motifIndex = chooseMotif(melodySeed, phrase, melody.motifs.length, previousMotif);
      previousMotif = motifIndex;
      const motif = melody.motifs[motifIndex]!;
      const start = phrase * phraseSeconds;
      const level = phrase < climaxPhrase ? 0.72 + 0.18 * (phrase / Math.max(1, climaxPhrase))
        : phrase === climaxPhrase ? 1 : Math.max(0.68, 1 - 0.1 * (phrase - climaxPhrase));
      const shifted = [4, 5].includes((phrase + melodyVariant) % 8) || phrase === climaxPhrase;
      const shift = melody.registerShift;
      motif.forEach(([note, offset, length], index) => push(
        melody.layer, start + swung(offset * beat, beat, style), length * beat,
        shifted && shift && note === shift.from ? shift.to : note, level,
        melody.panCenter + melody.panSpread * ((index + phrase + melodyVariant) % 3) / 2,
        melody.ornamentAt.includes(index) || phrase === climaxPhrase ? 1 : 0, melodySeed,
        voiceKey(0, phrase, index),
      ));
    }
  }

  voices.sort((first, second) => first.startFrame - second.startFrame);
  return {
    totalFrames, voices, reverb: style.reverb,
    maximumVoiceFrames: voices.reduce((most, voice) => Math.max(most, voice.frames), 2),
  };
}

/**
 * Draws the phrase's motif from the variant's own stream instead of rotating through the list, so asking for
 * another melody reorders the whole piece rather than shifting it by one. Never repeats the previous motif, which
 * is what a rotation guaranteed for free.
 */
function chooseMotif(melodySeed: number, phrase: number, count: number, previous: number): number {
  if (count < 2) return 0;
  const pool = previous < 0 ? count : count - 1;
  const roll = createRandom(mixSeed(melodySeed, 0x30f + phrase)).unit();
  const index = Math.min(pool - 1, Math.floor(roll * pool));
  return previous >= 0 && index >= previous ? index + 1 : index;
}

/**
 * Seeds a voice from where it sits in the arrangement rather than from how many voices came before it, so editing
 * one layer of a style leaves every other layer's noise, vibrato and detune exactly as it was.
 */
function voiceKey(layerIndex: number, bar: number, occurrence: number): number {
  return ((layerIndex + 1) * 4_096 + occurrence) * 8_192 + bar;
}

/** Delays every other swing unit, turning an even grid into a shuffle without moving the downbeats. */
function swung(offsetSeconds: number, beat: number, style: SoundtrackStyle): number {
  if (style.swing <= 0) return offsetSeconds;
  const unit = style.swingUnitBeats * beat;
  const steps = offsetSeconds / unit;
  const rounded = Math.round(steps);
  if (Math.abs(steps - rounded) > 1e-9 || rounded % 2 === 0) return offsetSeconds;
  return offsetSeconds + style.swing * unit;
}
