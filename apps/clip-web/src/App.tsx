import { analytics } from "@storyteller/analytics";
import { createSignInPath, usePersistentSession, useProfileLanguage } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { useLocation } from "react-router-dom";
import { authClient } from "./auth.js";
import { ClipShell } from "./components/ClipShell.js";
import { ExternalRedirect, useLocalization } from "@storyteller/web-ui";
import { useClipWebAnalytics } from "./use-clip-web-analytics.js";

export function App() {
  const { session, isLoading, updateProfile } = usePersistentSession(authClient);
  const location = useLocation();
  const { locale, setLocale } = useLocalization();
  useClipWebAnalytics(session?.profile.id);
  const updateProfileLanguage = useProfileLanguage({
    language: locale, onChanged: trackProfileLanguageChanged, profileLanguage: session?.profile.language,
    setLanguage: setLocale, updateProfile,
  });

  if (isLoading) return <main aria-busy="true">Checking session…</main>;
  if (!session) return <ExternalRedirect to={createSignInPath(`/app/clips${location.pathname}${location.search}`)} />;
  return <ClipShell profile={session.profile} onLanguageChange={updateProfileLanguage} />;
}

function trackProfileLanguageChanged(language: Locale): void {
  analytics.track("profile language changed", { language });
}
