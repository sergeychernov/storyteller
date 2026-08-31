import { useQuery } from "@tanstack/react-query";
import { getMaterialWaveform, type AuthSession, type VideoMaterial } from "../../api.js";

export function useMaterialWaveform(storyId: string, material: VideoMaterial, session: AuthSession) {
  const query = useQuery({
    queryKey: ["material-waveform", session.profile.id, storyId, material.id, material.audioTrack?.storageKey ?? material.storageKey],
    queryFn: ({ signal }) => getMaterialWaveform(session.csrfToken, storyId, material.id, signal),
    enabled: material.hasAudio,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1_000,
    retry: 1,
  });
  return { peaks: query.data?.peaks ?? [], loading: material.hasAudio && query.isPending, failed: query.isError };
}
