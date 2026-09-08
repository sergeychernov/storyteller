import type { ReactNode } from "react";
import type { SoundtrackPresetId, SoundtrackPresetSummary } from "../../api.js";
import styles from "./SoundtrackStylePicker.module.css";

export interface SoundtrackStylePickerProps {
  readonly presets: readonly SoundtrackPresetSummary[];
  readonly value: SoundtrackPresetId;
  readonly disabled?: boolean;
  readonly legend: string;
  readonly names: Readonly<Record<SoundtrackPresetId, string>>;
  readonly onChange: (id: SoundtrackPresetId) => void;
}

/**
 * Style is chosen by icon rather than by name: the tile stays the same size in every language,
 * while the name still reaches a pointer through the tooltip and a screen reader through the label.
 */
export function SoundtrackStylePicker({ presets, value, disabled, legend, names, onChange }: SoundtrackStylePickerProps) {
  return <fieldset className={styles.picker} disabled={disabled}>
    <legend className={styles.srOnly}>{legend}</legend>
    {presets.map(({ id }) => <label key={id} className={styles.option} title={names[id]}>
      <input type="radio" name="soundtrack-preset" value={id} checked={value === id} onChange={() => onChange(id)} />
      <span className={styles.tile}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{styleIcons[id]}</svg>
        <span className={styles.srOnly}>{names[id]}</span>
      </span>
    </label>)}
  </fieldset>;
}

/** Stroked glyphs on a shared 24×24 grid so the three tiles read as one set. */
const styleIcons: Readonly<Record<SoundtrackPresetId, ReactNode>> = {
  road: <>
    <path d="M4.5 21 9.5 3M19.5 21 14.5 3" />
    <path d="M12 5.5v2.2M12 11v2.4M12 16.6v2.6" />
  </>,
  lounge: <>
    <path d="M4.5 4.5h15L12 13z" />
    <path d="M12 13v6M8 19.5h8" />
  </>,
  dnb: <>
    <path d="M4.5 14.5v4M9.5 9.5v9M14.5 5v13.5M19.5 11.5v7" />
  </>,
};
