import { describe, expect, it, vi } from "vitest";
import { duckingRampSeconds, SoundtrackMixer, type SoundtrackAudioContext } from "./soundtrack-mixer.js";

describe("SoundtrackMixer", () => {
  it("plays both stems from one clock and keeps an independent level per stem", async () => {
    const context = new StubAudioContext();
    const mixer = new SoundtrackMixer(context as unknown as SoundtrackAudioContext, () => undefined, stub.fetch);
    mixer.setLevel("melody", 0.25);
    await mixer.load([{ id: "rhythm", url: "/rhythm" }, { id: "melody", url: "/melody" }]);

    expect(mixer.duration).toBe(12);
    expect(context.gains.map(({ gain }) => gain.value)).toEqual([1, 0.25]);
    await mixer.play();
    expect(context.started).toEqual([0, 0]);
    expect(context.sources.every((source) => source.connected)).toBe(true);

    context.currentTime = 3;
    expect(mixer.position()).toBe(3);
    mixer.setLevel("rhythm", 0);
    expect(context.gains[0]!.gain.value).toBe(0);
    expect(mixer.getLevel("rhythm")).toBe(0);
  });

  it("resumes from the paused position and restarts sources on a seek", async () => {
    const context = new StubAudioContext();
    const mixer = new SoundtrackMixer(context as unknown as SoundtrackAudioContext, () => undefined, stub.fetch);
    await mixer.load([{ id: "rhythm", url: "/rhythm" }]);
    await mixer.play();

    context.currentTime = 4;
    mixer.pause();
    expect(mixer.playing).toBe(false);
    expect(mixer.position()).toBe(4);
    await mixer.play();
    expect(context.started).toEqual([0, 4]);

    mixer.seek(9);
    expect(context.started).toEqual([0, 4, 9]);
    mixer.pause();
    mixer.seek(1_000);
    expect(mixer.position()).toBe(12);
  });

  it("ducks only the melody and restores it when the source audio stops", async () => {
    const context = new StubAudioContext();
    const mixer = new SoundtrackMixer(context as unknown as SoundtrackAudioContext, () => undefined, stub.fetch);
    await mixer.load([{ id: "rhythm", url: "/rhythm" }, { id: "melody", url: "/melody" }]);
    mixer.setLevel("melody", 0.8);

    mixer.setDucking(true, 0.25, 0);
    expect(context.gains[0]!.gain.value).toBe(1);
    expect(context.gains[1]!.gain.value).toBeCloseTo(0.2);

    mixer.setLevel("melody", 0.5);
    expect(context.gains[1]!.gain.value).toBeCloseTo(0.125);

    mixer.setDucking(false, 0.25, 0);
    expect(context.gains[1]!.gain.value).toBeCloseTo(0.5);
  });

  it("ramps a ducking change instead of stepping the gain", async () => {
    const context = new StubAudioContext();
    const mixer = new SoundtrackMixer(context as unknown as SoundtrackAudioContext, () => undefined, stub.fetch);
    await mixer.load([{ id: "melody", url: "/melody" }]);
    context.currentTime = 2;
    mixer.setDucking(true, 0.4);
    expect(context.ramps).toEqual([{ value: 0.4, at: 2 + duckingRampSeconds }]);
  });

  it("reports the end of the track once and rewinds", async () => {
    const context = new StubAudioContext();
    const ended = vi.fn();
    const mixer = new SoundtrackMixer(context as unknown as SoundtrackAudioContext, ended, stub.fetch);
    await mixer.load([{ id: "rhythm", url: "/rhythm" }]);
    await mixer.play();

    context.sources.at(-1)!.onended?.(new Event("ended") as never);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(mixer.playing).toBe(false);
    expect(mixer.position()).toBe(0);
  });
});

const stub = { fetch: () => Promise.resolve(new ArrayBuffer(8)) };

class StubSource {
  buffer: AudioBuffer | null = null;
  onended: ((event: Event) => void) | null = null;
  connected = false;
  constructor(private readonly context: StubAudioContext) {}
  connect(): void { this.connected = true; }
  start(_when: number, offset: number): void { this.context.started.push(offset); }
  stop(): void { this.context.stopped += 1; }
}

class StubAudioContext {
  currentTime = 0;
  state = "running";
  destination = {} as AudioNode;
  readonly gains: { gain: { value: number }; connect(): void }[] = [];
  readonly ramps: { value: number; at: number }[] = [];
  readonly sources: StubSource[] = [];
  readonly started: number[] = [];
  stopped = 0;
  decodeAudioData(): Promise<AudioBuffer> { return Promise.resolve({ duration: 12 } as AudioBuffer); }
  createGain(): GainNode {
    const ramps = this.ramps;
    const gain = {
      gain: {
        value: 1,
        cancelScheduledValues: () => undefined,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: (value: number, at: number) => { ramps.push({ value, at }); },
      },
      connect: () => undefined,
    };
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    const source = new StubSource(this);
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
  resume(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}
