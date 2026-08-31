import {
  collageCardShadow, createTornPaperClipPath, createTornPaperInnerFramePath, getCollageFrameWidth, tornPaperEdgeSeed,
  type CollageSettings,
} from "@storyteller/domain";
import type { CSSProperties, ReactNode } from "react";
import styles from "./CollageCard.module.css";

export interface CollageCardProps {
  readonly cardIndex: number;
  /** CSS width controls scale; height is always derived from the fixed rendered card aspect. */
  readonly width: Exclude<CSSProperties["width"], undefined>;
  /** Dimensions of the displayed crop inside the frame. */
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly frame: CollageSettings["frame"];
  readonly children: ReactNode;
  readonly animated?: boolean;
  readonly className?: string;
  readonly style?: Omit<CSSProperties, "width" | "height" | "aspectRatio" | "filter">;
}

export function CollageCard({
  cardIndex, width, contentWidth, contentHeight, frame, children, animated = false, className, style,
}: CollageCardProps) {
  const frameWidth = getCollageFrameWidth(frame);
  const renderWidth = contentWidth + frameWidth * 2;
  const renderHeight = contentHeight + frameWidth * 2;
  const torn = frame.shape === "torn";
  const seed = tornPaperEdgeSeed(cardIndex);
  const shadow = `drop-shadow(${cqw(collageCardShadow.offsetXRatio)} ${cqw(collageCardShadow.offsetYRatio)}`
    + ` ${cqw(collageCardShadow.blurSigmaRatio)} rgba(0,0,0,${collageCardShadow.opacity}))`;
  return <div
    data-collage-card={cardIndex}
    className={[styles.material, animated ? styles.animated : "", className].filter(Boolean).join(" ")}
    style={{
      ...style,
      width,
      height: "auto",
      aspectRatio: `${renderWidth} / ${renderHeight}`,
      filter: shadow,
    }}
  ><div
      className={styles.card}
      data-collage-card-shape={frame.shape}
      style={{
        borderWidth: `${frameWidth / 10.8}cqw`,
        borderColor: frame.color,
        ...(torn ? { clipPath: createTornPaperClipPath({
          width: renderWidth,
          height: renderHeight,
          frameWidth,
          seed,
        }) } : {}),
      }}
    ><div className={styles.content} data-collage-card-content>{children}
        {torn && frameWidth > 0 ? <svg
          aria-hidden="true"
          className={styles.innerFrame}
          data-collage-card-inner-edge="torn"
          preserveAspectRatio="none"
          viewBox={`0 0 ${contentWidth} ${contentHeight}`}
        ><path
            d={createTornPaperInnerFramePath({
              width: contentWidth,
              height: contentHeight,
              frameWidth,
              seed,
            })}
            fill={frame.color}
            fillRule="evenodd"
          /></svg> : null}</div></div></div>;
}

function cqw(ratio: number): string {
  return `${Number((ratio * 100).toFixed(4))}cqw`;
}
