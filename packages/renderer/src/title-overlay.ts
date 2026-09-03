import { sceneTitleFadeDurationSeconds } from "@storyteller/domain";

export interface TitleOverlaySpec {
  readonly sourcePath: string;
  readonly timing: { readonly startSeconds: number; readonly endSeconds: number };
}

export function titleOverlayInputArguments(title: TitleOverlaySpec, durationSeconds: number): readonly string[] {
  return ["-loop", "1", "-t", durationSeconds.toFixed(9), "-i", title.sourcePath];
}

export function buildTitleOverlayFilter(
  baseLabel: string,
  titleInputIndex: number,
  title: TitleOverlaySpec,
  outputLabel: string,
): string {
  const { startSeconds, endSeconds } = title.timing;
  const fade = Math.min(sceneTitleFadeDurationSeconds, (endSeconds - startSeconds) / 2);
  const fadeOutStart = Math.max(startSeconds, endSeconds - fade);
  return `[${titleInputIndex}:v]format=rgba,fade=t=in:st=${fixed(startSeconds)}:d=${fixed(fade)}:alpha=1,`
    + `fade=t=out:st=${fixed(fadeOutStart)}:d=${fixed(fade)}:alpha=1[title-overlay];`
    + `[${baseLabel}][title-overlay]overlay=x=0:y=0:shortest=1:eof_action=pass:format=auto[${outputLabel}]`;
}

function fixed(value: number): string { return value.toFixed(3); }
