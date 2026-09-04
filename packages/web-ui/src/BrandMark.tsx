import type { ImgHTMLAttributes } from "react";

export interface BrandMarkProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "alt" | "src"> {
  readonly tone?: "dark" | "light";
}

/** The shared Make It a Story symbol. It is decorative when paired with the wordmark. */
export function BrandMark({ tone = "light", ...props }: BrandMarkProps) {
  return (
    <img
      {...props}
      alt=""
      aria-hidden="true"
      draggable={false}
      src={`/brand/make-it-a-story-mark-${tone}.svg`}
    />
  );
}
