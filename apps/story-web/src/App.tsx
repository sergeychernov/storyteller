import { analytics } from "@storyteller/analytics";
import { Navigate, Route, Routes, useLocation, useMatch } from "react-router-dom";
import { createSignInPath, useProfileLanguage } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { AppHeader } from "./components/AppHeader.js";
import { ExternalRedirect } from "./components/ExternalRedirect.js";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout.js";
import { StoriesPage } from "./pages/StoriesPage.js";
import { StoryPage } from "./pages/StoryPage.js";
import { usePersistentSession } from "./use-persistent-session.js";
import { useStoryWebAnalytics } from "./use-story-web-analytics.js";
import { useLocalization } from "./localization.js";

export function App() {
  const { session, updateProfile } = usePersistentSession();
  const location = useLocation();
  const { locale, setLocale } = useLocalization();
  const editingStory = useMatch("/:storyId/*");
  useStoryWebAnalytics(session?.profile.id, session ? editingStory ? "story-editor" : "story-library" : "authentication-redirect");
  const updateProfileLanguage = useProfileLanguage({
    language: locale, onChanged: trackProfileLanguageChanged, profileLanguage: session?.profile.language,
    setLanguage: setLocale, updateProfile,
  });

  if (!session) {
    return <ExternalRedirect to={createSignInPath(`/app/stories${location.pathname}${location.search}`)} />;
  }

  return (
    <div>
      {!editingStory && <AppHeader profile={session.profile} onLanguageChange={updateProfileLanguage} />}
      <Routes>
        <Route element={<AuthenticatedLayout />}>
          <Route index element={<StoriesPage session={session} />} />
          <Route path=":storyId" element={<StoryPage session={session} />} />
          <Route path=":storyId/scenes/:sceneId" element={<StoryPage session={session} />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function trackProfileLanguageChanged(language: Locale): void {
  analytics.track("profile language changed", { language });
}
