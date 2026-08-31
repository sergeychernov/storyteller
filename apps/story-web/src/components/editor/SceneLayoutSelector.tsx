import { getLayoutOptions, materialOrientationSequence } from "@storyteller/domain";
import type { Scene } from "../../api.js";
import { classNames } from "../../class-names.js";
import type { EditorCopy } from "./editor-copy.js";
import styles from "./SceneInspector.module.css";
import type { SceneChange } from "./story-editor-view.js";

interface SceneLayoutSelectorProps {
  readonly scene: Scene;
  readonly copy: EditorCopy;
  readonly saving: boolean;
  readonly onChange: (change: SceneChange) => void;
}

export function SceneLayoutSelector({ scene, copy, saving, onChange }: SceneLayoutSelectorProps) {
  const layouts = getLayoutOptions(scene.materials);
  return <section>
    <div className={styles.heading}>
      <div><h2>{copy.layout}</h2><small>{copy.layoutHint}</small></div>
      <code>{materialOrientationSequence(scene.materials) || "—"}</code>
    </div>
    <div className={styles.optionGroup} role="group" aria-label={copy.layout}>
      {layouts.map((layout, index) => {
        const selected = scene.layoutId === layout.id || scene.layoutId === undefined
          && layouts.length === 2 && layouts[1]?.id === "overlap-stack" && index === 0;
        return <button
          type="button"
          className={classNames(styles.optionButton, selected && styles.activeOption)}
          disabled={saving}
          key={layout.id}
          aria-label={layout.label}
          aria-pressed={selected}
          title={`${layout.label} — ${layout.description}`}
          onClick={() => onChange({ layoutId: layout.id })}
        ><LayoutGlyph layoutId={layout.id} /></button>;
      })}
    </div>
  </section>;
}

export function LayoutGlyph({ layoutId }: { readonly layoutId: string }) {
  if (layoutId === "overlap-stack") return <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="3" width="13" height="16" rx="1.5" transform="rotate(-8 10.5 11)" />
    <rect x="8" y="6" width="12" height="15" rx="1.5" />
  </svg>;
  if (layoutId === "custom") return <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6M15 5l4 4M10 18l-4 1 1-4L18 4a2.1 2.1 0 0 1 3 3Z" />
  </svg>;
  const cascading = layoutId.startsWith("portrait-");
  const rows = cascading
    ? (layoutId.includes("pairs") ? [2, 2, 2] : [3, 3])
    : layoutId === "stack" ? [1, 1]
    : layoutId === "2x2" ? [2, 2]
    : /^\d+(?:\+\d+)+$/.test(layoutId) ? layoutId.split("+").map(Number)
    : [1];
  const width = cascading ? 14 : 18;
  const height = (18 - (rows.length - 1) * 2) / rows.length;
  return <svg viewBox="0 0 24 24" aria-hidden="true">
    {rows.flatMap((columns, row) => Array.from({ length: columns }, (_, column) => {
      const cellWidth = (width - (columns - 1) * 2) / columns;
      return <rect key={`${row}-${column}`} x={3 + column * (cellWidth + 2)} y={3 + row * (height + 2)} width={cellWidth} height={height} rx="0.8" />;
    }))}
    {cascading && <path d={layoutId.endsWith("ascending") ? "M21 20V4m-2 3 2-3 2 3" : "M21 4v16m-2-3 2 3 2-3"} />}
  </svg>;
}
