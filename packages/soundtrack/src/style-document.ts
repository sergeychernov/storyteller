import { z } from "zod";
import { timbreIds } from "./instruments.js";

/**
 * The editable half of a style. Everything here is plain data so a style can be shipped as JSON, versioned and
 * later edited in one admin editor; only the timbres and the renderer itself stay in code.
 */
const noteSchema = z.string().regex(/^[A-G][#b]?-?\d+$/u, "note must be scientific pitch notation, such as F#3");
const noteClassSchema = z.string().regex(/^[A-G][#b]?$/u, "a pitch class is a letter with an optional accidental");
const unitSchema = z.number().min(0).max(1);
const panSchema = z.number().min(-1).max(1);

/** Musical time in beats, wall-clock time in seconds, or both: a pitched note scales with tempo, a drum hit does not. */
export const spanSchema = z.object({
  beats: z.number().finite().optional(),
  seconds: z.number().finite().optional(),
}).strict();

export const chordSchema = z.object({
  /** Comping and pad voicing, low to high. */
  tones: z.array(noteSchema).min(1),
  /** The bass line for this bar, one note per bass hit. */
  bass: z.array(noteSchema).min(1),
}).strict();

export const styleLayerSchema = z.object({
  id: z.string().min(1),
  timbre: z.enum(timbreIds),
  stem: z.enum(["rhythm", "melody"]),
}).strict();

/** Holds a layer back until the arrangement has opened up, without needing code in the style. */
export const hitWindowSchema = z.object({
  fromBar: z.number().int().nonnegative().optional(),
  fromClimaxFraction: unitSchema.optional(),
}).strict();

/** A value that either holds for the whole repeat, or cycles over its steps. */
const cycled = <Schema extends z.ZodType>(schema: Schema) => z.union([schema, z.array(schema).min(1)]);

/** Writes one evenly spaced group of hits instead of repeating the same object with a shifted offset. */
export const repeatSchema = z.object({
  times: z.number().int().min(1).max(64),
  /** Added to `at` once per step; omit it to stack every step at the same moment, as a strum or a chord does. */
  every: spanSchema.optional(),
}).strict();

export const hitSchema = z.object({
  layer: z.string().min(1),
  at: spanSchema,
  duration: spanSchema,
  repeat: repeatSchema.optional(),
  pitch: z.object({ from: z.enum(["tones", "bass"]), index: cycled(z.number().int().nonnegative()) }).strict().optional(),
  pan: cycled(panSchema),
  /** Multiplies the bar energy; a pad that should not swell sets `flat`. */
  gain: cycled(z.number().min(0).max(4)).optional(),
  flat: z.boolean().optional(),
  /** Timbre-specific shaping, such as pluck brightness or a flute ornament. */
  variant: cycled(z.number().min(0).max(4)).optional(),
  when: hitWindowSchema.optional(),
}).strict();

/** `[note, offset in beats, duration in beats]`. */
export const motifNoteSchema = z.tuple([noteSchema, z.number().nonnegative(), z.number().positive()]);

export const melodyPlanSchema = z.object({
  layer: z.string().min(1),
  phraseBars: z.number().int().positive(),
  motifs: z.array(z.array(motifNoteSchema).min(1)).min(1),
  /**
   * Replaces one pitch of the motif in the brightest phrases. Off in every built-in style: it substitutes a single
   * pitch rather than transposing the phrase, so an octave target leaps and a smaller one flattens the contour.
   */
  registerShift: z.object({ from: noteSchema, to: noteSchema }).strict().optional(),
  ornamentAt: z.array(z.number().int().nonnegative()),
  panCenter: panSchema,
  panSpread: z.number().min(0).max(2),
}).strict();

export const styleDocumentSchema = z.object({
  /** Names the music, not the product: presets choose which style they play. */
  id: z.string().min(1),
  version: z.number().int().positive(),
  bpm: z.number().int().min(40).max(220),
  beatsPerBar: z.number().int().min(2).max(12),
  /** Delay applied to every other swing unit, as a fraction of it. 0 keeps the grid straight. */
  swing: z.number().min(0).max(0.5),
  swingUnitBeats: z.number().positive().max(4),
  tonalCenter: noteClassSchema,
  /** Every note the style may use. Anything outside it is rejected rather than left to sound wrong. */
  scale: z.array(noteClassSchema).min(3).max(12),
  chords: z.record(z.string().min(1), chordSchema),
  progression: z.array(z.string().min(1)).min(1),
  /** Cycled by bar index, so a style can state a one-, two- or four-bar groove. */
  groove: z.array(z.array(hitSchema)).min(1),
  layers: z.array(styleLayerSchema).min(1),
  melody: melodyPlanSchema.optional(),
  reverb: z.object({ rhythm: unitSchema, melody: unitSchema }).strict(),
}).strict();

export type SpanDocument = z.infer<typeof spanSchema>;
export type ChordDocument = z.infer<typeof chordSchema>;
export type StyleLayerDocument = z.infer<typeof styleLayerSchema>;
export type HitDocument = z.infer<typeof hitSchema>;
export type RepeatDocument = z.infer<typeof repeatSchema>;
export type MotifNoteDocument = z.infer<typeof motifNoteSchema>;
export type MelodyPlanDocument = z.infer<typeof melodyPlanSchema>;
export type StyleDocument = z.infer<typeof styleDocumentSchema>;

/**
 * Validates a style beyond its shape: the cross-references an editor can break — a groove hit naming a layer that
 * does not exist, a progression naming a missing chord, a pitch index past the end of a chord.
 */
const pitchClasses: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Semitones between two pitch classes, taking the shorter way round: 1 is the interval that reads as a wrong note. */
function classDistance(first: number, second: number): number {
  const gap = Math.abs(first - second) % 12;
  return Math.min(gap, 12 - gap);
}

export function pitchClassOf(note: string): number {
  const match = /^([A-G])([#b]?)/u.exec(note);
  if (!match) throw new Error(`unknown note: ${note}`);
  const value = pitchClasses[match[1]!]! + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  return ((value % 12) + 12) % 12;
}

export function parseStyleDocument(value: unknown): StyleDocument {
  const document = styleDocumentSchema.parse(value);
  const scale = new Set(document.scale.map(pitchClassOf));
  if (!scale.has(pitchClassOf(document.tonalCenter))) {
    throw new Error(`style ${document.id} tonal centre ${document.tonalCenter} is outside its own scale`);
  }
  const inScale = (note: string, where: string) => {
    if (!scale.has(pitchClassOf(note))) throw new Error(`${where} uses ${note}, which is outside the ${document.id} scale`);
  };
  for (const [name, chord] of Object.entries(document.chords)) {
    for (const note of [...chord.tones, ...chord.bass]) inScale(note, `style ${document.id} chord ${name}`);
  }
  for (const [index, motif] of (document.melody?.motifs ?? []).entries()) {
    for (const [note] of motif) inScale(note, `style ${document.id} motif ${index}`);
  }
  const layers = new Set(document.layers.map((layer) => layer.id));
  const duplicates = document.layers.length - layers.size;
  if (duplicates) throw new Error(`style ${document.id} declares the same layer twice`);
  for (const name of document.progression) {
    if (!document.chords[name]) throw new Error(`style ${document.id} progression names unknown chord ${name}`);
  }
  const chords = document.progression.map((name) => document.chords[name]!);
  document.groove.forEach((bar, barIndex) => bar.forEach((hit, hitIndex) => {
    const where = `style ${document.id} bar ${barIndex} hit ${hitIndex}`;
    if (!layers.has(hit.layer)) throw new Error(`${where} names unknown layer ${hit.layer}`);
    if (!hit.pitch) return;
    const indexes = Array.isArray(hit.pitch.index) ? hit.pitch.index : [hit.pitch.index];
    for (const index of indexes) {
      if (chords.some((chord) => chord[hit.pitch!.from].length <= index)) {
        throw new Error(`${where} reads ${hit.pitch.from} ${index} past the end of a chord`);
      }
    }
  }));
  if (document.melody && !layers.has(document.melody.layer)) {
    throw new Error(`style ${document.id} melody names unknown layer ${document.melody.layer}`);
  }
  const shift = document.melody?.registerShift;
  if (shift) {
    inScale(shift.from, `style ${document.id} register shift`);
    inScale(shift.to, `style ${document.id} register shift`);
    // The substitution is mechanical, so a target a semitone from a chord tone would read as a wrong note
    // every time that chord came round. Motif notes may hold that tension deliberately; this one may not.
    const target = pitchClassOf(shift.to);
    const rubbing = Object.entries(document.chords)
      .filter(([, chord]) => chord.tones.some((tone) => classDistance(pitchClassOf(tone), target) === 1))
      .map(([name]) => name);
    if (rubbing.length) {
      throw new Error(`style ${document.id} register shift to ${shift.to} sits a semitone from ${rubbing.join(", ")}`);
    }
  }
  return document;
}
