import { lazy, Suspense } from "react";
import type { AuthSession } from "../api.js";

const StoryPreviewPage = lazy(async () => {
  const module = await import("./StoryPreviewPage.js");
  return { default: module.StoryPreviewPage };
});

export function LazyStoryPreviewPage({ session }: { readonly session: AuthSession }) {
  return <Suspense fallback={null}><StoryPreviewPage session={session} /></Suspense>;
}
