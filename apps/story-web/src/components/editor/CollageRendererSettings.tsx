import {
  collageCardMaterials, collageFrameShapes, collageFrameWidths, collageRowDirections, getSelectedCollageLayout, resolveCollageSettings,
  type CollageLayoutEditorId, type CollageSettings,
} from "@storyteller/domain";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { SceneRendererSettingsProps } from "./SceneRenderer.js";
import { SceneDurationControl } from "./SceneDurationControl.js";
import styles from "./CollageRendererSettings.module.css";
import inspectorStyles from "./SceneInspector.module.css";

export function PaperStackCollageEditor(props: SceneRendererSettingsProps) {
  return <CollageRendererSettings {...props} editorId="paper-stack" />;
}

export function PaperRowsCollageEditor(props: SceneRendererSettingsProps) {
  return <CollageRendererSettings {...props} editorId="paper-rows" />;
}

export function PaperCascadeCollageEditor(props: SceneRendererSettingsProps) {
  return <CollageRendererSettings {...props} editorId="paper-cascade" />;
}

export function CollageRendererSettings({
  scene, copy, saving, onChange, editorId,
}: SceneRendererSettingsProps & { readonly editorId?: CollageLayoutEditorId }) {
  const settings = resolveCollageSettings(scene.materials, scene.collage, scene.durationSeconds);
  const layout = getSelectedCollageLayout(collageCardMaterials(scene.materials, settings), scene.layoutId);
  if (!layout || editorId && layout.editorId !== editorId) return null;
  const change = (changed: CollageSettings, rowDirectionConfigured?: CollageSettings["rowDirection"]) => {
    const {
      cardAngles: _hiddenAngles, cardOffsets: _hiddenOffsets, rowDirection: _preservedDirection, ...editable
    } = changed;
    onChange({
      collage: {
        ...editable,
        ...(rowDirectionConfigured ? { rowDirection: rowDirectionConfigured } : {}),
      },
      ...(rowDirectionConfigured ? { outcome: { collageRowDirectionConfigured: rowDirectionConfigured } } : {}),
    });
  };
  return <div data-collage-editor={layout.editorId}>
    <section>
      <h2>{copy.collageFrame}</h2>
      <div className={inspectorStyles.motionOptions} role="group" aria-label={copy.frameShape}>
        {collageFrameShapes.map((shape) => <button
          type="button"
          className={settings.frame.shape === shape ? inspectorStyles.active : undefined}
          disabled={saving}
          key={shape}
          aria-label={frameShapeLabel(copy, shape)}
          title={frameShapeLabel(copy, shape)}
          onClick={() => change({ ...settings, frame: { ...settings.frame, shape } })}
        ><FrameShapeGlyph shape={shape} /></button>)}
      </div>
      {settings.frame.shape !== "none" ? <div className={styles.frameControls}>
        <div className={styles.widthControl}>
          <span>{copy.frameWidth}</span>
          <div className={styles.widthOptions} role="group" aria-label={copy.frameWidth}>
            {collageFrameWidths.map((width) => <button
              type="button"
              key={width}
              disabled={saving}
              aria-pressed={settings.frame.width === width}
              onClick={() => change({ ...settings, frame: { ...settings.frame, width } })}
            >{width} px</button>)}
          </div>
        </div>
        <label className={styles.colorControl}>{copy.frameColor}<input
          type="color"
          value={settings.frame.color}
          disabled={saving}
          aria-label={copy.frameColor}
          onChange={(event) => change({ ...settings, frame: { ...settings.frame, color: event.target.value.toUpperCase() } })}
        /></label>
      </div> : null}
    </section>
    <SceneDurationControl
      durationSeconds={scene.durationSeconds}
      copy={copy}
      saving={saving}
      onCommit={(durationSeconds) => onChange({ durationSeconds })}
    />
    <section>
      <div><h2>{copy.collageMotion}</h2><small>{copy.collageMotionHint}</small></div>
      {layout.rowSizes.some((size) => size > 1) && <div className={styles.rowDirectionControl}>
        <span>{copy.collageRowDirection}</span>
        <div className={styles.rowDirectionOptions} role="group" aria-label={copy.collageRowDirection}>
          {collageRowDirections.filter((direction) => direction !== "random" || layout.rowSizes.length > 1).map((direction) => <button
            type="button"
            key={direction}
            disabled={saving}
            aria-pressed={settings.rowDirection === direction}
            aria-label={rowDirectionLabel(copy, direction)}
            title={rowDirectionLabel(copy, direction)}
            onClick={() => change({ ...settings, rowDirection: direction }, direction)}
          ><RowDirectionGlyph direction={direction} /></button>)}
        </div>
      </div>}
      <RangeDraft
        label={copy.entryTime}
        value={settings.entryDurationSeconds}
        min={0.5}
        max={Math.max(0.5, scene.durationSeconds - 1)}
        step={0.1}
        suffix={copy.seconds}
        disabled={saving}
        onCommit={(entryDurationSeconds) => change({
          ...settings,
          entryDurationSeconds,
        })}
      />
      <label className={styles.straightControl}>
        <input
          type="checkbox"
          checked={settings.straightCards}
          disabled={saving}
          onChange={(event) => change({ ...settings, straightCards: event.target.checked })}
        />
        <span>{copy.straightCollageCards}</span>
      </label>
    </section>
  </div>;
}

function RangeDraft(props: {
  readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly step: number;
  readonly suffix: string; readonly disabled: boolean; readonly onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  const lastCommitted = useRef<number | undefined>(undefined);
  useEffect(() => setDraft(props.value), [props.value]);
  useEffect(() => {
    // Allow an explicit retry after the request either succeeds or fails.
    if (!props.disabled) lastCommitted.current = undefined;
  }, [props.disabled]);
  const commit = (event: SyntheticEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setDraft(value);
    if (value === props.value || value === lastCommitted.current) return;
    lastCommitted.current = value;
    props.onCommit(value);
  };
  return <label className={styles.rangeControl}>
    <span>{props.label}</span>
    <input type="range" min={props.min} max={props.max} step={props.step} value={draft} disabled={props.disabled}
      onChange={(event) => setDraft(Number(event.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
    <strong>{draft} {props.suffix}</strong>
  </label>;
}

function FrameShapeGlyph({ shape }: { readonly shape: CollageSettings["frame"]["shape"] }) {
  if (shape === "none") return <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" />
    <path d="M5 19 19 5" />
  </svg>;
  return shape === "straight"
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 5 2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1-1 2 1 2-1 2 1 2-1 2 1 2-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1 1-2-1-2 1-2-1-2 1-2Z" /></svg>;
}

function frameShapeLabel(copy: SceneRendererSettingsProps["copy"], shape: CollageSettings["frame"]["shape"]): string {
  if (shape === "none") return copy.frameNone;
  return shape === "straight" ? copy.frameStraight : copy.frameTorn;
}

function RowDirectionGlyph({ direction }: { readonly direction: CollageSettings["rowDirection"] }) {
  const y = direction === "ascending" ? [14, 9, 4]
    : direction === "descending" ? [4, 9, 14]
    : direction === "level" ? [9, 9, 9]
    : [13, 4, 11];
  return <svg viewBox="0 0 36 22" aria-hidden="true">
    {y.map((top, index) => <rect key={index} x={2 + index * 11} y={top} width="10" height="6" rx="1" />)}
  </svg>;
}

function rowDirectionLabel(
  copy: SceneRendererSettingsProps["copy"], direction: CollageSettings["rowDirection"],
): string {
  if (direction === "ascending") return copy.rowAscending;
  if (direction === "descending") return copy.rowDescending;
  if (direction === "level") return copy.rowLevel;
  return copy.rowRandom;
}
