import {
  createEnvelope, fillSmoothedNoise, smoothInPlace, soundtrackSampleRate, type Random,
} from "./audio.js";

export interface TimbreContext {
  /** Length the envelope was written for; a voice clipped by the end of the track still keeps its shape. */
  readonly frames: number;
  readonly limit: number;
  readonly frequency: number;
  readonly variant: number;
  readonly scratch: Float64Array;
  readonly random: Random;
  emit(index: number, mono: number): void;
}

export type Timbre = (context: TimbreContext) => void;

export const timbreIds = [
  "guzheng", "dizi", "pluckedBass", "lowDrum", "woodblock", "shaker", "pad",
  "subBass", "breakKick", "breakSnare", "closedHat", "stab",
  "vibraphone", "nylonGuitar", "uprightBass", "brushSnare", "rimClick",
] as const;
export type TimbreId = typeof timbreIds[number];

/** Plucked zither: eight harmonics with their own decay rates plus a smoothed pick transient. */
const guzheng: Timbre = ({ frames, limit, frequency, variant, scratch, random, emit }) => {
  const phases = Array.from({ length: 9 }, () => random.unit() * 2 * Math.PI);
  fillSmoothedNoise(scratch, frames, 9, random);
  const envelope = createEnvelope(frames, 0.004, Math.min(0.16, frames / soundtrackSampleRate * 0.25), 0.35);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    let mono = 0;
    for (let harmonic = 1; harmonic < 9; harmonic += 1) {
      mono += variant / Math.pow(harmonic, 1.2)
        * Math.sin(2 * Math.PI * frequency * harmonic * time + phases[harmonic]!)
        * Math.exp(-time * (2.2 + 0.34 * harmonic));
    }
    mono += 0.11 * scratch[index]! * Math.exp(-time * 24);
    emit(index, mono * envelope(index) * 0.2);
  }
};

const pluckedBass: Timbre = ({ frames, limit, frequency, random, emit }) => {
  const offset = random.unit() * 0.2;
  const envelope = createEnvelope(frames, 0.008, Math.min(0.15, frames / soundtrackSampleRate * 0.3), 2.3);
  for (let index = 0; index < limit; index += 1) {
    const angle = 2 * Math.PI * frequency * (index / soundtrackSampleRate);
    const mono = Math.sin(angle + offset) + 0.3 * Math.sin(2 * angle) + 0.12 * Math.sin(3 * angle);
    emit(index, mono * envelope(index) * 0.18);
  }
};

/** Transverse flute: vibrato through accumulated phase, breath noise, optional grace-note ornament. */
const dizi: Timbre = ({ frames, limit, frequency, variant, scratch, random, emit }) => {
  const vibratoOffset = random.unit() * 2 * Math.PI;
  fillSmoothedNoise(scratch, frames, 41, random);
  const envelope = createEnvelope(frames, 0.055, Math.min(0.18, frames / soundtrackSampleRate * 0.3), 0.08);
  let travelled = 0;
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    let vibrato = 0.0042 * Math.sin(2 * Math.PI * 5.2 * time + vibratoOffset);
    if (variant) vibrato += 0.01 * Math.exp(-time * 18) * Math.sin(2 * Math.PI * 8 * time);
    travelled += 1 + vibrato;
    const phase = 2 * Math.PI * frequency * travelled / soundtrackSampleRate;
    const tone = Math.sin(phase) + 0.29 * Math.sin(2 * phase + 0.2) + 0.1 * Math.sin(3 * phase + 0.45);
    emit(index, (0.17 * tone + 0.02 * scratch[index]!) * envelope(index));
  }
};

const lowDrum: Timbre = ({ frames, limit, random, emit }) => {
  const envelope = createEnvelope(frames, 0.002, 0.035, 0);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    const phase = 2 * Math.PI * (48 * time + 28 / 16 * (1 - Math.exp(-16 * time)));
    const mono = Math.sin(phase) * Math.exp(-time * 9) + 0.025 * random.normal() * Math.exp(-time * 22);
    emit(index, 0.22 * mono * envelope(index));
  }
};

const woodblock: Timbre = ({ frames, limit, random, emit }) => {
  const base = 980 + random.unit() * 180;
  const envelope = createEnvelope(frames, 0.0015, 0.02, 0);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    const mono = Math.sin(2 * Math.PI * base * time) + 0.54 * Math.sin(2 * Math.PI * base * 1.62 * time + 0.3);
    emit(index, 0.105 * mono * Math.exp(-time * 31) * envelope(index));
  }
};

const shaker: Timbre = ({ frames, limit, scratch, random, emit }) => {
  const raw = new Float64Array(frames);
  for (let index = 0; index < frames; index += 1) raw[index] = random.normal();
  scratch.set(raw.subarray(0, frames));
  smoothInPlace(scratch, frames, 17);
  const envelope = createEnvelope(frames, 0.003, 0.025, 0);
  for (let index = 0; index < limit; index += 1) {
    const high = raw[index]! - scratch[index]!;
    emit(index, 0.022 * high * Math.exp(-index / soundtrackSampleRate * 34) * envelope(index));
  }
};

const pad: Timbre = ({ frames, limit, frequency, emit }) => {
  const envelope = createEnvelope(frames, 0.38, 0.55, 0.1);
  for (let index = 0; index < limit; index += 1) {
    const angle = 2 * Math.PI * frequency * (index / soundtrackSampleRate);
    const mono = Math.sin(angle) + 0.4 * Math.sin(2 * angle + 0.4);
    emit(index, mono * envelope(index) * 0.025);
  }
};

/** Saturated sine that stays audible on small speakers where the fundamental itself is not. */
const subBass: Timbre = ({ frames, limit, frequency, emit }) => {
  const envelope = createEnvelope(frames, 0.006, Math.min(0.09, frames / soundtrackSampleRate * 0.2), 0.5);
  for (let index = 0; index < limit; index += 1) {
    const angle = 2 * Math.PI * frequency * (index / soundtrackSampleRate);
    const mono = Math.tanh(1.7 * (Math.sin(angle) + 0.14 * Math.sin(2 * angle + 0.3)));
    emit(index, mono * envelope(index) * 0.24);
  }
};

const breakKick: Timbre = ({ frames, limit, random, emit }) => {
  const envelope = createEnvelope(frames, 0.001, 0.03, 0);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    const phase = 2 * Math.PI * (46 * time + 64 / 30 * (1 - Math.exp(-30 * time)));
    const mono = Math.sin(phase) * Math.exp(-time * 13) + 0.05 * random.normal() * Math.exp(-time * 65);
    emit(index, 0.27 * mono * envelope(index));
  }
};

/** Tuned shell plus a bright noise band; the backbone of a broken beat. */
const breakSnare: Timbre = ({ frames, limit, scratch, random, emit }) => {
  const raw = new Float64Array(frames);
  for (let index = 0; index < frames; index += 1) raw[index] = random.normal();
  scratch.set(raw.subarray(0, frames));
  smoothInPlace(scratch, frames, 9);
  const envelope = createEnvelope(frames, 0.001, 0.04, 0);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    const body = Math.sin(2 * Math.PI * 186 * time) * 0.5 + Math.sin(2 * Math.PI * 279 * time + 0.4) * 0.3;
    const noise = raw[index]! - scratch[index]!;
    emit(index, 0.21 * (body * Math.exp(-time * 22) + 1.15 * noise * Math.exp(-time * 17)) * envelope(index));
  }
};

const closedHat: Timbre = ({ frames, limit, scratch, random, emit }) => {
  const raw = new Float64Array(frames);
  for (let index = 0; index < frames; index += 1) raw[index] = random.normal();
  scratch.set(raw.subarray(0, frames));
  smoothInPlace(scratch, frames, 5);
  const envelope = createEnvelope(frames, 0.0008, 0.012, 0);
  for (let index = 0; index < limit; index += 1) {
    const high = raw[index]! - scratch[index]!;
    emit(index, 0.055 * high * Math.exp(-index / soundtrackSampleRate * 95) * envelope(index));
  }
};

/** Detuned harmonic stack with a closing brightness sweep, the short chordal hit of a broken beat. */
const stab: Timbre = ({ frames, limit, frequency, variant, random, emit }) => {
  const detune = 1 + (random.unit() - 0.5) * 0.006;
  const envelope = createEnvelope(frames, 0.004, Math.min(0.12, frames / soundtrackSampleRate * 0.3), 3);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    let mono = 0;
    for (let harmonic = 1; harmonic < 8; harmonic += 1) {
      mono += Math.sin(2 * Math.PI * frequency * detune * harmonic * time) / harmonic
        * Math.exp(-time * (6 + 1.5 * harmonic));
    }
    emit(index, mono * envelope(index) * (0.12 + 0.04 * variant));
  }
};

/** Nearly harmonic bar partials with the motor tremolo that gives a vibraphone its shimmer. */
const vibraphone: Timbre = ({ frames, limit, frequency, random, emit }) => {
  const tremoloOffset = random.unit() * 2 * Math.PI;
  const envelope = createEnvelope(frames, 0.002, Math.min(0.25, frames / soundtrackSampleRate * 0.3), 1.4);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    const angle = 2 * Math.PI * frequency * time;
    const tone = Math.sin(angle) + 0.34 * Math.sin(4 * angle + 0.6) + 0.11 * Math.sin(10 * angle + 1.2);
    const tremolo = 1 + 0.28 * Math.sin(2 * Math.PI * 5.2 * time + tremoloOffset);
    emit(index, 0.17 * tone * tremolo * envelope(index));
  }
};

const nylonGuitar: Timbre = ({ frames, limit, frequency, variant, scratch, random, emit }) => {
  const phases = Array.from({ length: 7 }, () => random.unit() * 2 * Math.PI);
  fillSmoothedNoise(scratch, frames, 13, random);
  const envelope = createEnvelope(frames, 0.003, Math.min(0.18, frames / soundtrackSampleRate * 0.25), 0.9);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    let mono = 0;
    for (let harmonic = 1; harmonic < 7; harmonic += 1) {
      mono += variant / Math.pow(harmonic, 1.45)
        * Math.sin(2 * Math.PI * frequency * harmonic * time + phases[harmonic]!)
        * Math.exp(-time * (3.2 + 0.5 * harmonic));
    }
    mono += 0.07 * scratch[index]! * Math.exp(-time * 30);
    emit(index, mono * envelope(index) * 0.19);
  }
};

const uprightBass: Timbre = ({ frames, limit, frequency, random, emit }) => {
  const envelope = createEnvelope(frames, 0.006, Math.min(0.12, frames / soundtrackSampleRate * 0.25), 3.1);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    const angle = 2 * Math.PI * frequency * time;
    const mono = Math.sin(angle) + 0.22 * Math.sin(2 * angle) + 0.08 * Math.sin(3 * angle)
      + 0.06 * random.normal() * Math.exp(-time * 40);
    emit(index, mono * envelope(index) * 0.2);
  }
};

/** Wide, soft noise instead of a struck head: the sound of brushes rather than sticks. */
const brushSnare: Timbre = ({ frames, limit, scratch, random, emit }) => {
  const raw = new Float64Array(frames);
  for (let index = 0; index < frames; index += 1) raw[index] = random.normal();
  scratch.set(raw.subarray(0, frames));
  smoothInPlace(scratch, frames, 25);
  const envelope = createEnvelope(frames, 0.012, 0.05, 0);
  for (let index = 0; index < limit; index += 1) {
    const high = raw[index]! - scratch[index]!;
    emit(index, 0.06 * high * Math.exp(-index / soundtrackSampleRate * 11) * envelope(index));
  }
};

const rimClick: Timbre = ({ frames, limit, random, emit }) => {
  const envelope = createEnvelope(frames, 0.001, 0.015, 0);
  for (let index = 0; index < limit; index += 1) {
    const time = index / soundtrackSampleRate;
    const mono = Math.sin(2 * Math.PI * 1_720 * time) * Math.exp(-time * 70)
      + 0.3 * random.normal() * Math.exp(-time * 120);
    emit(index, 0.07 * mono * envelope(index));
  }
};

export const timbres: Readonly<Record<TimbreId, Timbre>> = {
  guzheng, dizi, pluckedBass, lowDrum, woodblock, shaker, pad,
  subBass, breakKick, breakSnare, closedHat, stab,
  vibraphone, nylonGuitar, uprightBass, brushSnare, rimClick,
};
