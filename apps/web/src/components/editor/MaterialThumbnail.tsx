import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMaterialContent, type AuthSession, type SceneMaterial } from "../../api.js";
import { classNames } from "../../class-names.js";
import styles from "./MaterialThumbnail.module.css";

interface MaterialThumbnailProps {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly presentation: "preview" | "timeline";
  readonly className?: string;
}

export function MaterialThumbnail({ storyId, material, session, presentation, className }: MaterialThumbnailProps) {
  const [url, setUrl] = useState<string>();
  const content = useQuery({
    queryKey: ["material-content", storyId, material.id],
    queryFn: () => getMaterialContent(session.accessToken, storyId, material.id),
    staleTime: 60 * 60 * 1_000,
  });

  useEffect(() => {
    if (!content.data) return;
    const objectUrl = URL.createObjectURL(content.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [content.data]);

  const mediaClassName = classNames(styles[presentation], className);
  if (!url) return <span className={classNames(styles.placeholder, mediaClassName)}>{material.kind === "video" ? "▶" : "◫"}</span>;
  return material.kind === "video"
    ? <video className={classNames(styles.media, mediaClassName)} src={url} muted playsInline preload="metadata" />
    : <img className={classNames(styles.media, mediaClassName)} src={url} alt="" draggable={false} />;
}
