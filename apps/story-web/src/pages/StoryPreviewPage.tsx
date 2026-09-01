import { Navigate, useParams } from "react-router-dom";
import type { AuthSession } from "../api.js";
import { StoryPreviewDetails } from "../components/preview/StoryPreviewDetails.js";

export function StoryPreviewPage({ session }: { readonly session: AuthSession }) {
  const { storyId } = useParams();
  return storyId ? <StoryPreviewDetails session={session} storyId={storyId} /> : <Navigate to="/" replace />;
}
