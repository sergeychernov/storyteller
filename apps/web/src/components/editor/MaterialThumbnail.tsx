import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMaterialContent, type AuthSession, type SceneMaterial } from "../../api.js";

interface MaterialThumbnailProps {
  readonly storyId: string;
  readonly material: SceneMaterial;
  readonly session: AuthSession;
  readonly className?: string;
}

export function MaterialThumbnail({ storyId, material, session, className = "" }: MaterialThumbnailProps) {
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

  if (!url) return <span className={`material-media-placeholder ${className}`}>{material.kind === "video" ? "▶" : "◫"}</span>;
  return material.kind === "video"
    ? <video className={`material-media ${className}`} src={url} muted playsInline preload="metadata" />
    : <img className={`material-media ${className}`} src={url} alt="" draggable={false} />;
}
