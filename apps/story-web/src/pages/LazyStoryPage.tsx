import { lazy, Suspense } from "react";
import { useLocalization } from "@storyteller/web-ui";
import feedbackStyles from "@storyteller/web-ui/feedback.module.css";
import type { AuthSession } from "../api.js";
import styles from "../components/StoryDetails.module.css";

type StoryPageModule = typeof import("./StoryPage.js");

let storyPageModule: Promise<StoryPageModule> | undefined;

const StoryPage = lazy(async () => {
  const module = await loadStoryPageModule();
  return { default: module.StoryPage };
});

export function LazyStoryPage({ session }: { readonly session: AuthSession }) {
  return (
    <Suspense fallback={<StoryPageFallback />}>
      <StoryPage session={session} />
    </Suspense>
  );
}

export function preloadStoryPage(): void {
  void loadStoryPageModule().catch(() => undefined);
}

function loadStoryPageModule(): Promise<StoryPageModule> {
  storyPageModule ??= import("./StoryPage.js").catch((error: unknown) => {
    storyPageModule = undefined;
    throw error;
  });
  return storyPageModule;
}

function StoryPageFallback() {
  const { t } = useLocalization();
  return (
    <main className={styles.loading} aria-busy="true" aria-live="polite">
      <div className={feedbackStyles.emptyCard}>{t("web.story.loading")}</div>
    </main>
  );
}
