import { videoPixelCrop } from "@storyteller/domain";
import type { Ref, VideoHTMLAttributes } from "react";
import type { VideoMaterial } from "../../api.js";
import styles from "./CroppedVideo.module.css";

interface CroppedVideoProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "style" | "className"> {
  readonly material: VideoMaterial;
  readonly videoRef?: Ref<HTMLVideoElement>;
  readonly fit?: "cover" | "contain";
}

export function CroppedVideo({ material, videoRef, fit = "cover", ...props }: CroppedVideoProps) {
  const crop = videoPixelCrop(material.width, material.height, material.edit);
  const ratio = crop.width / crop.height;
  return <div className={styles.viewport}>
    <div className={styles.crop} style={{ width: `${fit === "cover" ? "max" : "min"}(100cqw, ${ratio * 100}cqh)`, aspectRatio: ratio }}>
      <video {...props} ref={videoRef} className={styles.video} style={{
        width: `${material.width / crop.width * 100}%`, height: `${material.height / crop.height * 100}%`,
        left: `${(crop.rotatedWidth / 2 - crop.left) / crop.width * 100}%`,
        top: `${(crop.rotatedHeight / 2 - crop.top) / crop.height * 100}%`,
        transform: `translate(-50%, -50%) rotate(${material.edit?.rotation ?? 0}deg)`,
      }} />
    </div>
  </div>;
}
