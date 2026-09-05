export const soundtrackSampleRate = 48_000;
export const soundtrackChannels = 2;

/** Power-of-two accumulator that lets a voice write past the current block without holding the whole track. */
export class Ring {
  private readonly data: Float64Array;
  private readonly mask: number;
  private readonly frame: [number, number] = [0, 0];

  constructor(minimumFrames: number) {
    let size = 1;
    while (size < minimumFrames) size *= 2;
    this.mask = size - 1;
    this.data = new Float64Array(size * 2);
  }

  add(frame: number, left: number, right: number): void {
    const index = (frame & this.mask) * 2;
    this.data[index] = this.data[index]! + left;
    this.data[index + 1] = this.data[index + 1]! + right;
  }

  take(frame: number): readonly [number, number] {
    const index = (frame & this.mask) * 2;
    this.frame[0] = this.data[index]!;
    this.frame[1] = this.data[index + 1]!;
    this.data[index] = 0;
    this.data[index + 1] = 0;
    return this.frame;
  }
}

/** Three-tap ping-pong early reflection network; taps read the dry signal, so it stays a stable FIR. */
export class Reverb {
  private static readonly taps = [
    { delay: 0.083, gain: 0.22, swap: true }, { delay: 0.147, gain: 0.15, swap: false },
    { delay: 0.231, gain: 0.09, swap: true },
  ] as const;

  private readonly data: Float64Array;
  private readonly mask: number;
  private readonly scale: number;
  private position = 0;
  left = 0;
  right = 0;

  constructor(amount: number) {
    let size = 1;
    while (size < Math.round(0.231 * soundtrackSampleRate) + 2) size *= 2;
    this.mask = size - 1;
    this.data = new Float64Array(size * 2);
    this.scale = 1 - amount * 0.18;
  }

  process(dryLeft: number, dryRight: number): void {
    const index = (this.position & this.mask) * 2;
    this.data[index] = dryLeft;
    this.data[index + 1] = dryRight;
    let left = dryLeft;
    let right = dryRight;
    for (const { delay, gain, swap } of Reverb.taps) {
      const at = this.position - Math.round(delay * soundtrackSampleRate);
      if (at < 0) continue;
      const tap = (at & this.mask) * 2;
      left += gain * this.data[swap ? tap + 1 : tap]!;
      right += gain * this.data[swap ? tap : tap + 1]!;
    }
    this.position += 1;
    this.left = left * this.scale;
    this.right = right * this.scale;
  }
}

export class Fade {
  private readonly fadeIn: number;
  private readonly fadeOutStart: number;
  private readonly fadeOut: number;

  constructor(totalFrames: number, fadeInSeconds: number, fadeOutSeconds: number) {
    this.fadeIn = Math.min(totalFrames, Math.round(fadeInSeconds * soundtrackSampleRate));
    this.fadeOut = Math.min(totalFrames, Math.round(fadeOutSeconds * soundtrackSampleRate));
    this.fadeOutStart = totalFrames - this.fadeOut;
  }

  at(frame: number): number {
    let value = 1;
    if (this.fadeIn > 1 && frame < this.fadeIn) value = frame / (this.fadeIn - 1);
    if (this.fadeOut > 1 && frame >= this.fadeOutStart) value *= 1 - (frame - this.fadeOutStart) / (this.fadeOut - 1);
    return value;
  }
}

/** Raised-cosine attack and release with optional exponential decay, matching the reference score renderer. */
export function createEnvelope(frames: number, attack: number, release: number, decay: number): (index: number) => number {
  const attackFrames = Math.min(frames, Math.max(1, Math.round(attack * soundtrackSampleRate)));
  const releaseFrames = Math.min(frames - attackFrames, Math.max(1, Math.round(release * soundtrackSampleRate)));
  const releaseStart = frames - releaseFrames;
  return (index) => {
    let value = index < attackFrames ? (attackFrames > 1 ? 0.5 - 0.5 * Math.cos(Math.PI * index / (attackFrames - 1)) : 0) : 1;
    if (decay > 0) value *= Math.exp(-index / soundtrackSampleRate * decay);
    if (releaseFrames > 0 && index >= releaseStart) {
      value *= releaseFrames > 1 ? 0.5 + 0.5 * Math.cos(Math.PI * (index - releaseStart) / (releaseFrames - 1)) : 1;
    }
    return value;
  };
}

export function fillSmoothedNoise(scratch: Float64Array, frames: number, kernel: number, random: Random): void {
  for (let index = 0; index < frames; index += 1) scratch[index] = random.normal();
  smoothInPlace(scratch, frames, kernel);
}

/** Centred moving average, the streaming equivalent of a `same`-mode box convolution. */
export function smoothInPlace(values: Float64Array, frames: number, kernel: number): void {
  const half = (kernel - 1) / 2;
  const window = new Float64Array(kernel);
  let running = 0;
  for (let index = 0; index < frames + half; index += 1) {
    const incoming = index < frames ? values[index]! : 0;
    const slot = index % kernel;
    running += incoming - window[slot]!;
    window[slot] = incoming;
    const target = index - half;
    if (target >= 0) values[target] = running / kernel;
  }
}

export interface Random {
  unit(): number;
  normal(): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  let spare: number | undefined;
  const unit = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
  return {
    unit,
    normal() {
      if (spare !== undefined) {
        const value = spare;
        spare = undefined;
        return value;
      }
      const radius = Math.sqrt(-2 * Math.log(1 - unit()));
      const angle = 2 * Math.PI * unit();
      spare = radius * Math.sin(angle);
      return radius * Math.cos(angle);
    },
  };
}

export function panGains(pan: number): readonly [number, number] {
  const theta = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
  return [Math.cos(theta), Math.sin(theta)];
}

const pitchClasses: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Scientific pitch notation, so a style can reach sub bass or piccolo without extending a lookup table. */
export function noteFrequency(note: string): number {
  const match = /^([A-G])([#b]?)(-?\d+)$/u.exec(note);
  if (!match) throw new Error(`unknown score note: ${note}`);
  const [, letter, accidental, octave] = match;
  const semitone = pitchClasses[letter!]! + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  return 440 * Math.pow(2, ((Number(octave) + 1) * 12 + semitone - 69) / 12);
}

export function mixSeed(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e37_79b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function toPcm16(value: number): number {
  return Math.round(Math.max(-1, Math.min(1, value)) * 32_767);
}
