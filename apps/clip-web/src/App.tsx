import { createSignInPath, usePersistentSession } from "@storyteller/auth-client";
import { useLocation } from "react-router-dom";
import { authClient } from "./auth.js";
import { ClipShell } from "./components/ClipShell.js";
import { ExternalRedirect } from "./components/ExternalRedirect.js";
import { useClipWebAnalytics } from "./use-clip-web-analytics.js";

export function App() {
  const { session } = usePersistentSession(authClient);
  const location = useLocation();
  useClipWebAnalytics(session?.profile.id);
  if (!session) return <ExternalRedirect to={createSignInPath(`/app/clips${location.pathname}${location.search}`)} />;
  return <ClipShell profileName={session.profile.name} />;
}
