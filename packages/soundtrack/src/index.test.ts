import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createPcm16WaveHeader, generateSoundtrack, getSoundtrackPreset, soundtrackChannels, soundtrackEngineVersion,
  compileSoundtrackStyle, planScore, soundtrackLicenseVersion, soundtrackPresets, soundtrackSampleRate,
  soundtrackStyles, timbreIds, type SoundtrackPresetId,
} from "./index.js";
import loungeDocument from "./styles/lounge.json" with { type: "json" };
import pentatonicDocument from "./styles/pentatonic.json" with { type: "json" };

async function render(presetId: SoundtrackPresetId, seconds = 6, blockSampleFrames = 4_096, melodyVariant = 0) {
  const digests = { rhythm: createHash("sha256"), melody: createHash("sha256"), preview: createHash("sha256") };
  const energy = { rhythm: 0, melody: 0 };
  const lastAudible = { rhythm: 0, melody: 0 };
  let frames = 0;
  let maximumPcmSample = 0;
  const result = await generateSoundtrack({
    presetId, presetVersion: 1, seed: "story-fixture", melodyVariant, blockSampleFrames,
    totalSampleFrames: Math.round(seconds * soundtrackSampleRate),
  }, (chunk) => {
    frames += chunk.sampleFrames;
    for (const stem of ["rhythm", "melody", "preview"] as const) {
      const buffer = chunk[stem];
      digests[stem].update(buffer);
      for (let offset = 0; offset < buffer.length; offset += 2) {
        const sample = buffer.readInt16LE(offset);
        maximumPcmSample = Math.max(maximumPcmSample, Math.abs(sample));
        if (stem === "preview") continue;
        energy[stem] += sample * sample;
        if (Math.abs(sample) > 4) lastAudible[stem] = frames + Math.floor(offset / 4);
      }
    }
  });
  const samples = frames * soundtrackChannels;
  return {
    frames, maximumPcmSample, result, lastAudible,
    digest: Object.fromEntries(Object.entries(digests).map(([key, hash]) => [key, hash.digest("hex")])) as Record<"rhythm" | "melody" | "preview", string>,
    rms: { rhythm: Math.sqrt(energy.rhythm / samples) / 32_768, melody: Math.sqrt(energy.melody / samples) / 32_768 },
  };
}

test("exposes one preset per style with road as the default", () => {
  assert.deepEqual(soundtrackPresets.map(({ id, bpm, style, default: selected }) => ({ id, bpm, style: style.id, selected })), [
    { id: "road", bpm: 96, style: "pentatonic", selected: true },
    { id: "lounge", bpm: 84, style: "lounge", selected: false },
    { id: "dnb", bpm: 174, style: "dnb", selected: false },
  ]);
  assert.equal(soundtrackEngineVersion, 5);
  assert.equal(soundtrackLicenseVersion, "storyteller-generated-music-1.0");
});

test("every preset plays only layers its style declares, and every layer has a real timbre", () => {
  for (const preset of soundtrackPresets) {
    const declared = new Map(preset.style.layers.map((layer) => [layer.id, layer]));
    for (const layer of preset.layers) {
      const found = declared.get(layer);
      assert.ok(found, `${preset.id} enables unknown layer ${layer}`);
      assert.ok(timbreIds.includes(found.timbre), `${preset.id}:${layer} has no timbre`);
    }
    const grooveLayers = new Set(preset.style.groove.flat().map((hit) => hit.layer));
    for (const layer of grooveLayers) assert.ok(declared.has(layer), `${preset.style.id} groove uses undeclared ${layer}`);
    if (preset.style.melody) assert.ok(declared.has(preset.style.melody.layer), `${preset.style.id} melody layer is undeclared`);
  }
});

test("the styles differ from each other in more than tempo", async () => {
  assert.deepEqual(soundtrackStyles.map(({ id }) => id), ["pentatonic", "lounge", "dnb"]);
  const [road, lounge, dnb] = await Promise.all([render("road"), render("lounge"), render("dnb")]);
  assert.equal(new Set([road.digest.preview, lounge.digest.preview, dnb.digest.preview]).size, 3);
  // A shuffled style must place its off-beats late; a straight one must not.
  assert.equal(getSoundtrackPreset("lounge")?.style.swing, 0.28);
  assert.equal(getSoundtrackPreset("road")?.style.swing, 0);
  // Broken beats need more than a one-bar loop and far more events per second.
  assert.equal(getSoundtrackPreset("dnb")?.style.groove.length, 2);
  assert.equal(getSoundtrackPreset("road")?.style.groove.length, 1);
  assert.ok(dnb.result.voices > road.result.voices * 2, `dnb ${dnb.result.voices} vs road ${road.result.voices}`);
  for (const rendered of [lounge, dnb]) {
    assert.ok(rendered.rms.rhythm > 0.02 && rendered.rms.melody > 0.02, "both stems must carry material");
    assert.ok(rendered.maximumPcmSample < 32_767);
  }
});

test("resolves presets by id and rejects retired ones", () => {
  assert.equal(getSoundtrackPreset("road")?.style.id, "pentatonic");
  for (const retired of ["calm", "adventure", "nope"]) assert.equal(getSoundtrackPreset(retired), undefined);
});

test("renders deterministic, distinct, bounded PCM in exact-length blocks", async () => {
  const first = await render("road");
  const repeated = await render("road");
  assert.deepEqual(first.digest, repeated.digest);
  assert.equal(first.frames, 288_000);
  assert.equal(first.result.totalSampleFrames, first.frames);
  assert.equal(first.result.sampleRate, soundtrackSampleRate);
  assert.equal(first.result.channels, soundtrackChannels);
  assert.ok(first.maximumPcmSample < 32_767);
});

test("renders identical audio regardless of the streaming block size", async () => {
  const small = await render("road", 6, 256);
  const large = await render("road", 6, 32_768);
  assert.deepEqual(small.digest, large.digest);
});

test("normalises both stems so the rhythm section carries the track on its own", async () => {
  const { digest, result, rms } = await render("road");
  assert.notEqual(digest.rhythm, digest.melody);
  assert.ok(Math.abs(result.rhythmPeak - 0.64) < 1e-3, `rhythm peak ${result.rhythmPeak}`);
  assert.ok(Math.abs(result.melodyPeak - 0.56) < 1e-3, `melody peak ${result.melodyPeak}`);
  assert.ok(rms.rhythm > 0.02, `rhythm rms ${rms.rhythm}`);
  assert.ok(rms.melody > 0.02, `melody rms ${rms.melody}`);
  assert.ok(result.previewPeak > 0.5 && result.previewPeak < 1, `preview peak ${result.previewPeak}`);
});

test("carries both stems to the end of a track that is not a whole number of bars", async () => {
  for (const seconds of [6, 9.4, 24, 37.3]) {
    const { lastAudible, frames } = await render("road", seconds);
    for (const stem of ["rhythm", "melody"] as const) {
      const silentTail = (frames - lastAudible[stem]) / soundtrackSampleRate;
      assert.ok(silentTail < 0.05, `${stem} stops ${silentTail.toFixed(3)}s early at ${seconds}s`);
    }
  }
});

test("refuses a register shift that would rub against the harmony", () => {
  const document = JSON.parse(JSON.stringify(loungeDocument));
  // C5 lifted to E5 stays inside the scale but sits a semitone from the thirds of Dm7, Gm7 and Bbmaj7.
  document.melody.registerShift = { from: "C5", to: "E5" };
  assert.throws(() => compileSoundtrackStyle(document), /semitone from Dm7, Gm7, Bbmaj7/u);
  document.melody.registerShift = { from: "C5", to: "D5" };
  assert.equal(compileSoundtrackStyle(document).melody?.registerShift?.to, "D5");
});

test("asking for another melody reorders the piece instead of shifting it by one", async () => {
  const preset = getSoundtrackPreset("road")!;
  const sequences = new Set<string>();
  for (let variant = 0; variant < 24; variant += 1) {
    const { voices } = planScore({
      style: { ...preset.style, bpm: preset.bpm }, enabledLayers: new Set(preset.layers),
      seed: 11, totalFrames: 48_000 * 90, melodyVariant: variant,
    });
    sequences.add(voices.filter(({ melody }) => melody).sort((first, second) => first.startFrame - second.startFrame)
      .map(({ startFrame, frequency }) => `${startFrame}:${frequency.toFixed(3)}`).join("|"));
  }
  assert.equal(sequences.size, 24, "a rotation would have repeated once per motif count");
});

test("seeds a voice from where it sits, so editing one layer leaves the others alone", async () => {
  const document = JSON.parse(JSON.stringify(pentatonicDocument));
  const untouched = compileSoundtrackStyle(document);
  document.groove[0].push({ layer: "woodblock", at: { beats: 2.5 }, duration: { seconds: 0.13 }, pan: 0 });
  const edited = compileSoundtrackStyle(document);
  const plan = (style: ReturnType<typeof compileSoundtrackStyle>) => planScore({
    style, enabledLayers: new Set(style.layers.map(({ id }) => id)), seed: 42, totalFrames: 48_000 * 6, melodyVariant: 0,
  }).voices;
  const before = plan(untouched);
  const after = plan(edited);
  assert.ok(after.length > before.length, "the extra hit must reach the score");
  const seedsOf = (voices: typeof before, timbre: string) =>
    voices.filter((voice) => voice.timbre === timbre).map(({ seed }) => seed);
  for (const timbre of ["dizi", "pluckedBass", "guzheng", "shaker", "lowDrum"]) {
    assert.deepEqual(seedsOf(after, timbre), seedsOf(before, timbre), `${timbre} was reseeded by an unrelated edit`);
  }
});

test("regenerates the melody over a bit-identical rhythm section", async () => {
  const first = await render("road", 6, 4_096, 0);
  const second = await render("road", 6, 4_096, 1);
  assert.equal(first.digest.rhythm, second.digest.rhythm);
  assert.notEqual(first.digest.melody, second.digest.melody);
  assert.notEqual(first.digest.preview, second.digest.preview);
  await assert.rejects(generateSoundtrack({
    presetId: "road", presetVersion: 1, seed: "x", totalSampleFrames: 48_000, melodyVariant: 100,
  }, () => undefined), /melody variant/);
});

test("rejects an edited style whose cross-references do not resolve", () => {
  const valid = JSON.parse(JSON.stringify(pentatonicDocument));
  assert.equal(compileSoundtrackStyle(valid).id, "pentatonic");
  const broken: readonly [string, (document: Record<string, any>) => void][] = [
    ["unknown layer", (document) => { document.groove[0][0].layer = "nope"; }],
    ["unknown chord", (document) => { document.progression[0] = "Z"; }],
    ["pitch past the end", (document) => { document.groove[0][0].pitch.index = 9; }],
    ["unknown melody layer", (document) => { document.melody.layer = "nope"; }],
    ["unknown timbre", (document) => { document.layers[0].timbre = "kazoo"; }],
    ["repeat past the chord", (document) => { document.groove[0][1].pitch.index = [0, 1, 2, 9]; }],
    ["motif note outside the scale", (document) => { document.melody.motifs[0][0][0] = "C5"; }],
    ["chord tone outside the scale", (document) => { document.chords.D.tones[0] = "C4"; }],
    ["tonal centre outside the scale", (document) => { document.tonalCenter = "C"; }],
    ["register shift outside the scale", (document) => { document.melody.registerShift.to = "G5"; }],
    ["unreadable note", (document) => { document.chords.D.tones[0] = "H4"; }],
    ["unknown field", (document) => { document.tempo = 120; }],
  ];
  for (const [reason, damage] of broken) {
    const document = JSON.parse(JSON.stringify(pentatonicDocument));
    damage(document);
    assert.throws(() => compileSoundtrackStyle(document), Error, reason);
  }
});

test("writes a PCM16 stereo 48 kHz WAV header", () => {
  const header = createPcm16WaveHeader(48_000);
  assert.equal(header.toString("ascii", 0, 4), "RIFF");
  assert.equal(header.toString("ascii", 8, 12), "WAVE");
  assert.equal(header.readUInt16LE(22), 2);
  assert.equal(header.readUInt32LE(24), 48_000);
  assert.equal(header.readUInt32LE(40), 48_000 * 2 * 2);
});

test("rejects empty and longer-than-three-minute renders", async () => {
  const common = { presetId: "road" as const, presetVersion: 1 as const, seed: "x" };
  await assert.rejects(generateSoundtrack({ ...common, totalSampleFrames: 0 }, () => undefined), /between one sample/);
  await assert.rejects(generateSoundtrack({ ...common, totalSampleFrames: 180 * 48_000 + 1 }, () => undefined), /between one sample/);
  await assert.rejects(generateSoundtrack({ ...common, totalSampleFrames: 48_000, blockSampleFrames: 64 }, () => undefined), /block size/);
});
