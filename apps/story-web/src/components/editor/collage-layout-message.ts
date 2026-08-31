import { getImplementedCollageOrientationSequences } from "@storyteller/domain";
import type { EditorCopy } from "./editor-copy.js";

export function formatCollageLayoutUnavailable(copy: EditorCopy, sequence: string): string {
  const supported = getImplementedCollageOrientationSequences()
    .map((implemented) => implemented.toUpperCase())
    .join(", ");
  return copy.collageLayoutUnavailable
    .replace("{{sequence}}", sequence.toUpperCase())
    .replace("{{supported}}", supported);
}
