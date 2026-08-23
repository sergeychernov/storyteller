import { Navigate, useParams } from "react-router-dom";
import type { AuthSession } from "../api.js";
import { StoryDetails } from "../components/StoryDetails.js";

export function StoryPage({ session }: { readonly session: AuthSession }) {
  const { storyId } = useParams();
  return storyId ? <StoryDetails session={session} storyId={storyId} /> : <Navigate to="/stories" replace />;
}
