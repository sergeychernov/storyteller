import { Navigate, useParams } from "react-router-dom";
import type { AuthSession } from "../api.js";
import { StoryDetails } from "../components/StoryDetails.js";

export function StoryPage({ session }: { readonly session: AuthSession }) {
  const { storyId, sceneId } = useParams();
  return storyId ? <StoryDetails session={session} storyId={storyId} sceneId={sceneId} /> : <Navigate to="/stories" replace />;
}
