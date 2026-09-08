# @storyteller/soundtrack

Deterministic procedural music for stories. No network, no files, no samples, no model weights: a style is planned
once as note events on a single global timeline, then synthesised into PCM in bounded blocks.

## Listening to what you are about to change

Reading a motif as `["D5", 0, 0.9]` tells you very little. This renders every motif and every groove bar of every
style as a short clip and writes a page that plays them:

```bash
yarn soundtrack:audition
```

Then open `packages/soundtrack/audition/index.html`. One style at a time:

```bash
yarn soundtrack:audition dnb
```

Each motif is played twice — alone and over its own groove, because a melody is hard to judge without the harmony
under it — and each groove bar is played without the melody. The clips come from the shipping renderer through
`renderSoundtrackStyle`, so rejecting a pattern there rejects exactly what a creator would have heard. The output
directory is generated and ignored by git; rerun the command after editing a style.

## What lives where

| File | What it holds |
|---|---|
| `src/styles/*.json` | The editable half of a style: tempo, swing, chords, progression, groove, layers, motifs |
| `src/style-document.ts` | The schema that validates those documents, including cross-references |
| `src/score.ts` | Compiles a document and lays it out as note events on the timeline |
| `src/instruments.ts` | The timbres, as code — the one part a JSON document cannot describe |
| `src/audio.ts` | Envelopes, panning, reverb, the streaming ring buffer, the PRNG |

A style names the music (`pentatonic`, `lounge`, `dnb`); a preset names what a creator picks (`road`, `lounge`,
`dnb`) and points at a style. Renaming either leaves the other alone.

## Editing a style

Everything below is data, so an editor can produce it and the schema will catch what an editor can break — a hit
naming a layer that does not exist, a progression naming a missing chord, a pitch index past the end of a chord.

```json
{
  "layer": "hat",
  "at": {"beats": 0},
  "duration": {"seconds": 0.03},
  "repeat": {"times": 16, "every": {"beats": 0.25}},
  "pan": [-0.24, 0, 0.24, 0],
  "gain": [1, 0.55, 0.55, 0.55, 0.55, 0.55, 1, 0.55, 0.55, 0.55, 1, 0.55, 0.55, 0.55, 0.55, 0.55]
}
```

- **`beats` versus `seconds`.** A pitched note scales with tempo; a drum hit does not. State whichever you mean, or
  both — they add.
- **`repeat`.** Writes one evenly spaced group instead of the same object with a shifted offset. Omit `every` to
  stack every step at the same moment, as a strum or a chord does.
- **Cycled values.** `pan`, `gain`, `variant` and `pitch.index` accept an array that cycles over the repeat steps.
- **`when`.** Holds a layer back until the arrangement opens up, for example
  `{"fromBar": 1, "fromClimaxFraction": 0.25}`.
- **`scale` and `tonalCenter`.** Every note a style may use. Chord tones, bass notes, motif notes and the register
  shift are all checked against it, so a note outside the key is rejected rather than left to sound wrong.
- **`registerShift`.** Replaces one pitch of the motif in the brightest phrases. It is a mechanical substitution,
  so the parser refuses a target sitting a semitone from any chord tone in the progression — that interval would
  read as a wrong note every time the chord came round. Naming the target as a note rather than an interval is what
  keeps it inside the scale: `+5` semitones from `D5` would be `G5`, which a D major pentatonic does not contain.
  Keep the lift small; an octave preserves the pitch identity but leaps, and the built-in styles use +2 to +5.

Motifs are drawn from the melody variant's own stream and never repeat back to back, so asking for another melody
reorders the whole piece. A rotation would only have shifted it, giving as many distinct melodies as there are
motifs. A voice is seeded from where it sits in the arrangement — its layer, bar and position within the bar — so adding a
hit to one layer leaves every other layer's noise, vibrato and detune exactly as it was.

## Changing the sound on purpose

Any edit that changes what a listener hears needs `soundtrackEngineVersion` bumped in `src/index.ts`: the version
is part of the render's input hash, so without it a story keeps serving the soundtrack it already has. Until the
MVP ships there is no backward compatibility to keep — add a migration that drops renders from older engine
versions rather than widening a type to accept them.
