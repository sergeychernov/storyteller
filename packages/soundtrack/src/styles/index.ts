import { compileSoundtrackStyle, type SoundtrackStyle } from "../score.js";
import { parseStyleDocument, type StyleDocument } from "../style-document.js";
import dnbDocument from "./dnb.json" with { type: "json" };
import loungeDocument from "./lounge.json" with { type: "json" };
import pentatonicDocument from "./pentatonic.json" with { type: "json" };

/**
 * The built-in styles, validated at load. Each is a plain JSON document, so the same parser the future preset
 * editor uses is the one that guards what ships.
 */
export const soundtrackStyleDocuments: readonly StyleDocument[] =
  [pentatonicDocument, loungeDocument, dnbDocument].map(parseStyleDocument);

export const soundtrackStyles: readonly SoundtrackStyle[] = soundtrackStyleDocuments.map(compileSoundtrackStyle);
