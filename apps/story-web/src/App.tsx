import { analytics } from "@storyteller/analytics";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation, useMatch } from "react-router-dom";
import { createSignInPath, useProfileLanguage } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { AppHeader } from "./components/AppHeader.js";
import { ExternalRedirect, useLocalization } from "@storyteller/web-ui";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout.js";
import { LazyStoryPage } from "./pages/LazyStoryPage.js";
import { StoriesPage } from "./pages/StoriesPage.js";
import { usePersistentSession } from "./use-persistent-session.js";
import { useStoryWebAnalytics } from "./use-story-web-analytics.js";
import { AccessProvider, hasCapability } from "./access-control.js";
import { getEffectiveAccess } from "./api.js";
import { AccessStatus } from "./components/AccessStatus.js";

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
  const access = useQuery({
    queryKey: ["effective-access", session?.profile.id],
    queryFn: () => getEffectiveAccess(session!.accessToken),
    enabled: Boolean(session),
    retry: false,
  });

  if (!session) {
    return <ExternalRedirect to={createSignInPath(`/app/stories${location.pathname}${location.search}`)} />;
  }

  if (access.isPending) return <><AppHeader profile={session.profile} onLanguageChange={updateProfileLanguage} /><AccessStatus state="loading" /></>;
  if (access.isError || !access.data) return <><AppHeader profile={session.profile} onLanguageChange={updateProfileLanguage} /><AccessStatus state="error" /></>;
  if (!hasCapability(access.data, "studio.access")) {
    return <><AppHeader profile={session.profile} onLanguageChange={updateProfileLanguage} /><AccessStatus state="denied" /></>;
  }

  return (
    <AccessProvider access={access.data}><div>
      {!editingStory && <AppHeader profile={session.profile} onLanguageChange={updateProfileLanguage} />}
      <Routes>
        <Route element={<AuthenticatedLayout />}>
          <Route index element={<StoriesPage session={session} />} />
          <Route path=":storyId" element={<LazyStoryPage session={session} />} />
          <Route path=":storyId/scenes/:sceneId" element={<LazyStoryPage session={session} />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div></AccessProvider>
  );
}

function trackProfileLanguageChanged(language: Locale): void {
  analytics.track("profile language changed", { language });
}
