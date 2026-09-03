import {
  getSceneDurationSeconds, sceneTitleColors, sceneTitleMaximumCharacters, sceneTitleMaximumLines,
  sceneTitleMinimumDurationSeconds, sceneTitleSizes, sceneTitleStyles, type SceneTitle,
} from "@storyteller/domain";
import type { Scene } from "../../api.js";
import { useRef } from "react";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import type { SceneTitleEditorController } from "./use-scene-title-editor.js";
import styles from "./SceneTitlePanel.module.css";

interface SceneTitlePanelProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly editor: SceneTitleEditorController;
  readonly variant: "desktop" | "mobile";
}

export function SceneTitlePanel({ scene, copy, editor, variant }: SceneTitlePanelProps) {
  const title = editor.title;
  const durationSeconds = getSceneDurationSeconds(scene);
  const panel = useRef<HTMLDivElement>(null);
  return <div ref={panel} className={classNames(styles.panel, styles[variant])}>
    {!title ? <div className={styles.emptyState}>
      <p>{editor.canAdd ? copy.titleTextPlaceholder : copy.titleUnavailable}</p>
      <button type="button" className={styles.toggle} disabled={!editor.canAdd || editor.saving} onClick={editor.add}>
        ＋ {copy.addTitle}
      </button>
    </div> : <>
      <div className={styles.textGroup}>
        <label htmlFor={`scene-title-text-${scene.id}`}>{copy.titleText}</label>
        <textarea
          id={`scene-title-text-${scene.id}`}
          value={title.text}
          rows={3}
          maxLength={sceneTitleMaximumCharacters}
          placeholder={copy.titleTextPlaceholder}
          disabled={editor.saving}
          autoFocus={!scene.title}
          onChange={(event) => editor.preview({ ...title, text: limitText(event.target.value) })}
          onBlur={(event) => {
            if (event.relatedTarget instanceof Node && panel.current?.contains(event.relatedTarget)) return;
            void editor.saveText().catch(() => undefined);
          }}
        />
        <span className={styles.counter}>{[...title.text].length}/{sceneTitleMaximumCharacters}</span>
      </div>
      <fieldset className={classNames(styles.controlGroup, styles.styleControl)}>
        <legend>{copy.titleStyle}</legend>
        <div className={classNames(styles.segmented, styles.styleOptions)}>{sceneTitleStyles.map((value) => <StylePresetButton
          key={value}
          style={value}
          selected={title.style === value}
          label={value === "plain" ? copy.titleStylePlain : value === "shadow" ? copy.titleStyleShadow : copy.titleStylePlate}
          disabled={editor.saving}
          onClick={() => savePreset(editor, { ...title, style: value })}
        />)}</div>
      </fieldset>
      <fieldset className={classNames(styles.controlGroup, styles.sizeControl)}>
        <legend>{copy.titleSize}</legend>
        <div className={styles.segmented}>{sceneTitleSizes.map((value) => <PresetButton
          key={value}
          selected={title.size === value}
          label={value === "small" ? "S" : value === "medium" ? "M" : "L"}
          disabled={editor.saving}
          onClick={() => savePreset(editor, { ...title, size: value })}
        />)}</div>
      </fieldset>
      <fieldset className={classNames(styles.controlGroup, styles.colorControl)}>
        <legend>{copy.titleColor}</legend>
        <div className={styles.colors}>{sceneTitleColors.map((value) => <button
          type="button"
          key={value}
          className={styles.color}
          aria-label={`${copy.titleColor} ${value}`}
          aria-pressed={title.color === value}
          disabled={editor.saving}
          style={{ backgroundColor: value }}
          onClick={() => savePreset(editor, { ...title, color: value })}
        />)}</div>
      </fieldset>
      <TitleTiming title={title} durationSeconds={durationSeconds} copy={copy} editor={editor} />
      <div className={styles.actions}>
        <p>{copy.titleSafeZoneWarning}</p>
        <button type="button" className={styles.toggle} disabled={editor.saving}
          onClick={() => void editor.remove().catch(() => undefined)}>
          − {copy.removeTitle}
        </button>
      </div>
    </>}
  </div>;
}

function TitleTiming({ title, durationSeconds, copy, editor }: {
  readonly title: SceneTitle;
  readonly durationSeconds: number;
  readonly copy: EditorCopy;
  readonly editor: SceneTitleEditorController;
}) {
  const minimum = Math.min(sceneTitleMinimumDurationSeconds, durationSeconds);
  const changeStart = (value: number) => editor.preview({
    ...title, timing: { ...title.timing, startSeconds: Math.min(value, title.timing.endSeconds - minimum) },
  });
  const changeEnd = (value: number) => editor.preview({
    ...title, timing: { ...title.timing, endSeconds: Math.max(value, title.timing.startSeconds + minimum) },
  });
  const commit = () => {
    const current = editor.title;
    if (current) void editor.save(current, "timing").catch(() => undefined);
  };
  return <fieldset className={classNames(styles.controlGroup, styles.timing)}>
    <legend>{copy.titleTiming}</legend>
    <div className={styles.rangeTrack}>
      <input type="range" min={0} max={durationSeconds} step={0.1} value={title.timing.startSeconds}
        aria-label={copy.titleStart} disabled={editor.saving} onChange={(event) => changeStart(Number(event.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      <input type="range" min={0} max={durationSeconds} step={0.1} value={title.timing.endSeconds}
        aria-label={copy.titleEnd} disabled={editor.saving} onChange={(event) => changeEnd(Number(event.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    </div>
    <div className={styles.timeLabels}>
      <span>{copy.titleStart}: {title.timing.startSeconds.toFixed(1)}s</span>
      <span>{copy.titleEnd}: {title.timing.endSeconds.toFixed(1)}s</span>
    </div>
  </fieldset>;
}

function PresetButton({ selected, label, disabled, onClick }: {
  readonly selected: boolean; readonly label: string; readonly disabled: boolean; readonly onClick: () => void;
}) {
  return <button type="button" aria-pressed={selected} disabled={disabled} onClick={onClick}>{label}</button>;
}

function StylePresetButton({ style, selected, label, disabled, onClick }: {
  readonly style: SceneTitle["style"];
  readonly selected: boolean;
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return <button type="button" aria-label={label} title={label} aria-pressed={selected}
    disabled={disabled} onClick={onClick}>
    <TitleStyleIcon style={style} />
  </button>;
}

function TitleStyleIcon({ style }: { readonly style: SceneTitle["style"] }) {
  const glyph = <path d="M7 4h14M14 4v12" />;
  return <svg className={styles.styleIcon} viewBox="0 0 28 20" aria-hidden="true">
    {style === "plate" && <rect className={styles.styleIconPlate} x="1" y="1" width="26" height="18" rx="3" />}
    {style === "shadow" && <g className={styles.styleIconShadow} transform="translate(2 2)">{glyph}</g>}
    <g className={style === "plate" ? styles.styleIconPlateGlyph : undefined}>{glyph}</g>
  </svg>;
}

function savePreset(editor: SceneTitleEditorController, title: SceneTitle) {
  editor.preview(title);
  void editor.save(title, "appearance").catch(() => undefined);
}

function limitText(value: string): string {
  return value.replace(/\r\n?/g, "\n").split("\n").slice(0, sceneTitleMaximumLines).join("\n").slice(0, sceneTitleMaximumCharacters);
}
