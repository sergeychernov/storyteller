import { useEffect, useRef } from "react";
import type { VideoExportMode } from "../../api.js";
import type { DownloadFile } from "./use-scene-download.js";

interface PreparedSceneDownloadLinkProps {
  readonly mode: VideoExportMode;
  readonly label: string;
  readonly format: string;
  readonly readyLabel: string;
  readonly download: DownloadFile;
  readonly autoStart: boolean;
  readonly onDownloaded: (mode: VideoExportMode) => void;
  readonly onAutoStarted: (mode: VideoExportMode) => void;
}

export function PreparedSceneDownloadLink({
  mode, label, format, readyLabel, download, autoStart, onDownloaded, onAutoStarted,
}: PreparedSceneDownloadLinkProps) {
  const link = useRef<HTMLAnchorElement>(null);
  const autoStartedUrl = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!autoStart || !link.current || autoStartedUrl.current === download.url) return;
    autoStartedUrl.current = download.url;
    link.current.click();
    onAutoStarted(mode);
  }, [autoStart, download.url, mode, onAutoStarted]);

  return <a ref={link} href={download.url} download={download.filename} onClick={() => onDownloaded(mode)}>
    {label}<small>{format} · {readyLabel}</small>
  </a>;
}
