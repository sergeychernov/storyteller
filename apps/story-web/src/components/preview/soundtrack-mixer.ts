import type { SoundtrackStemId } from "../../api.js";

export interface SoundtrackMixerTrack {
  readonly id: SoundtrackStemId;
  readonly url: string;
}

/** The slice of `AudioContext` the mixer needs, so the model can be driven by a stub in tests. */
export interface SoundtrackAudioContext {
  readonly currentTime: number;
  readonly destination: AudioNode;
  readonly state: string;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type SoundtrackMixerFetch = (url: string) => Promise<ArrayBuffer>;

/** Matches the transition the export mix uses when narration starts or stops. */
export const duckingRampSeconds = 0.4;

export function fetchSoundtrackStem(url: string): Promise<ArrayBuffer> {
  return fetch(url, { credentials: "include", cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`stem request failed with ${response.status}`);
    return response.arrayBuffer();
  });
}

export function createSoundtrackAudioContext(): SoundtrackAudioContext | undefined {
  const constructor = typeof window === "undefined" ? undefined
    : window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return constructor ? new constructor() : undefined;
}

/**
 * Plays the rhythm and melody stems sample-synchronously with an independent level per stem, so a creator can
 * hear the same balance the export mix applies to them.
 */
export class SoundtrackMixer {
  private readonly buffers = new Map<SoundtrackStemId, AudioBuffer>();
  private readonly gains = new Map<SoundtrackStemId, GainNode>();
  private readonly levels = new Map<SoundtrackStemId, number>();
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0;
  private offset = 0;
  private generation = 0;
  private duckMultiplier = 1;
  private ducked = false;
  duration = 0;
  playing = false;

  constructor(
    private readonly context: SoundtrackAudioContext,
    private readonly onEnded: () => void,
    private readonly fetchStem: SoundtrackMixerFetch = fetchSoundtrackStem,
  ) {}

  async load(tracks: readonly SoundtrackMixerTrack[]): Promise<void> {
    const decoded = await Promise.all(tracks.map(async ({ id, url }) =>
      [id, await this.context.decodeAudioData(await this.fetchStem(url))] as const));
    for (const [id, buffer] of decoded) {
      const gain = this.context.createGain();
      gain.connect(this.context.destination);
      this.buffers.set(id, buffer);
      this.gains.set(id, gain);
      this.applyLevel(id, 0);
      this.duration = Math.max(this.duration, buffer.duration);
    }
  }

  setLevel(id: SoundtrackStemId, level: number, rampSeconds = 0): void {
    this.levels.set(id, Math.max(0, Math.min(1, level)));
    this.applyLevel(id, rampSeconds);
  }

  getLevel(id: SoundtrackStemId): number {
    return this.levels.get(id) ?? 1;
  }

  /** Ducking multiplies the melody channel only; the rhythm section keeps carrying the track under speech. */
  setDucking(active: boolean, multiplier: number, rampSeconds = duckingRampSeconds): void {
    const changed = active !== this.ducked || multiplier !== this.duckMultiplier;
    this.ducked = active;
    this.duckMultiplier = Math.max(0, Math.min(1, multiplier));
    if (changed) this.applyLevel("melody", rampSeconds);
  }

  private targetLevel(id: SoundtrackStemId): number {
    const level = this.levels.get(id) ?? 1;
    return id === "melody" && this.ducked ? level * this.duckMultiplier : level;
  }

  private applyLevel(id: SoundtrackStemId, rampSeconds: number): void {
    const gain = this.gains.get(id);
    if (!gain) return;
    const target = this.targetLevel(id);
    const parameter = gain.gain as AudioParam;
    if (rampSeconds > 0 && typeof parameter.linearRampToValueAtTime === "function"
      && typeof parameter.cancelScheduledValues === "function") {
      const now = this.context.currentTime;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(parameter.value, now);
      parameter.linearRampToValueAtTime(target, now + rampSeconds);
      return;
    }
    parameter.value = target;
  }

  async play(offsetSeconds?: number): Promise<void> {
    if (this.playing || !this.buffers.size) return;
    if (this.context.state === "suspended") await this.context.resume();
    if (offsetSeconds !== undefined) this.offset = Math.max(0, Math.min(this.duration, offsetSeconds));
    if (this.offset >= this.duration) this.offset = 0;
    const generation = this.generation;
    this.startedAt = this.context.currentTime;
    this.playing = true;
    this.sources = [...this.buffers].map(([id, buffer]) => {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gains.get(id)!);
      source.start(0, this.offset);
      return source;
    });
    const first = this.sources[0];
    if (first) {
      first.onended = () => {
        if (generation !== this.generation || !this.playing) return;
        this.playing = false;
        this.offset = 0;
        this.sources = [];
        this.onEnded();
      };
    }
  }

  pause(): void {
    if (!this.playing) return;
    this.offset = this.position();
    this.stopSources();
  }

  seek(seconds: number): void {
    const target = Math.max(0, Math.min(this.duration, seconds));
    if (!this.playing) {
      this.offset = target;
      return;
    }
    this.stopSources();
    void this.play(target);
  }

  position(): number {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, this.offset + (this.context.currentTime - this.startedAt));
  }

  dispose(): void {
    this.stopSources();
    this.buffers.clear();
    this.gains.clear();
    void this.context.close();
  }

  private stopSources(): void {
    this.generation += 1;
    this.playing = false;
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A source that already reached its end throws on stop; the generation guard makes that harmless.
      }
    }
    this.sources = [];
  }
}
