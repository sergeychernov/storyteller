import { analytics } from "@storyteller/analytics";
import { usePersistentSession, useProfileLanguage } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { authClient } from "./auth.js";
import { ProductChooser } from "./components/ProductChooser.js";
import { SiteAppHeader } from "./components/SiteAppHeader.js";
import { publicPages } from "./components/public/public-site-model.js";
import { PublicPage } from "./pages/PublicPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { SignInPage } from "./pages/SignInPage.js";
import { useLocalization } from "@storyteller/web-ui";
import { useSiteAnalytics } from "./use-site-analytics.js";

export function App() {
  const sessionState = usePersistentSession(authClient);
  const location = useLocation();
  const { locale, setLocale } = useLocalization();
  useSiteAnalytics(sessionState.session?.profile.id);
  const studioPath = sessionState.session ? "/app" : "/sign-in?continue=%2Fapp";
  const signOut = () => {
    analytics.reset();
    sessionState.clearSession();
  };
  const updateProfileLanguage = useProfileLanguage({
    language: locale, onChanged: trackProfileLanguageChanged, profileLanguage: sessionState.session?.profile.language,
    setLanguage: setLocale, synchronize: location.pathname === "/app" || location.pathname.startsWith("/app/"),
    updateProfile: sessionState.updateProfile,
  });

  return (
    <Routes>
      {publicPages.map((resolvedPage) => (
        <Route key={resolvedPage.page.path} path={resolvedPage.page.path} element={<PublicPage resolvedPage={resolvedPage}
          session={sessionState.session} studioPath={studioPath} onLanguageChange={updateProfileLanguage} />} />
      ))}
      <Route path="/sign-in" element={<SignInPage sessionState={sessionState} />} />
      <Route path="/app" element={sessionState.session
        ? <><SiteAppHeader profile={sessionState.session.profile} onLanguageChange={updateProfileLanguage} /><ProductChooser session={sessionState.session} onSignOut={signOut} /></>
        : <Navigate to="/sign-in?continue=%2Fapp" replace />} />
      <Route path="/app/profile" element={sessionState.session
        ? <><SiteAppHeader profile={sessionState.session.profile} onLanguageChange={updateProfileLanguage} />
          <ProfilePage profile={sessionState.session.profile} onLanguageChange={updateProfileLanguage} /></>
        : <Navigate to="/sign-in?continue=%2Fapp%2Fprofile" replace />} />
      <Route path="*" element={<main><h1>Page not found</h1><a href="/">Make It a Story</a></main>} />
    </Routes>
  );
}

function trackProfileLanguageChanged(language: Locale): void {
  analytics.track("profile language changed", { language });
}
