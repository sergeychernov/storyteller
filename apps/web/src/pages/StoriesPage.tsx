import type { AuthSession } from "../api.js";
import { StoryLibrary } from "../components/StoryLibrary.js";

export function StoriesPage({ session }: { readonly session: AuthSession }) {
  return <StoryLibrary session={session} />;
}
