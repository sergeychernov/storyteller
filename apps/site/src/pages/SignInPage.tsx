import { analytics } from "@storyteller/analytics";
import { resolveContinueTarget, type AuthSession } from "@storyteller/auth-client";
import { useSearchParams } from "react-router-dom";
import { ExternalRedirect } from "@storyteller/web-ui";
import { SignIn } from "../components/SignIn.js";
import { SiteAppHeader } from "../components/SiteAppHeader.js";

export interface SignInSessionState {
  readonly session: AuthSession | null;
  readonly isLoading: boolean;
  readonly authenticate: (session: AuthSession) => void;
}

export function SignInPage({ sessionState }: { readonly sessionState: SignInSessionState }) {
  const [searchParams] = useSearchParams();
  const continuePath = resolveContinueTarget(
    searchParams.get("continue"), import.meta.env.VITE_ADMIN_URL ?? "https://admin.makeitastory.app",
  );
  if (sessionState.isLoading) return <><SiteAppHeader /><main aria-busy="true">Checking session…</main></>;
  if (sessionState.session) return <ExternalRedirect to={continuePath} />;

  const authenticated = async (session: AuthSession, accountCreated: boolean): Promise<void> => {
    analytics.setUser(session.profile.id);
    analytics.track(accountCreated ? "account created" : "account signed in", {});
    await analytics.flush().catch(() => undefined);
    sessionState.authenticate(session);
    window.location.assign(continuePath);
  };

  return <><SiteAppHeader /><main><SignIn onAuthenticated={authenticated} /></main></>;
}
