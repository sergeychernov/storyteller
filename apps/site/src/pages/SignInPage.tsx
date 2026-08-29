import { sanitizeContinuePath, type AuthSession } from "@storyteller/auth-client";
import { useSearchParams } from "react-router-dom";
import { ExternalRedirect } from "../components/ExternalRedirect.js";
import { SignIn } from "../components/SignIn.js";
import { SiteAppHeader } from "../components/SiteAppHeader.js";

export interface SignInSessionState {
  readonly session: AuthSession | null;
  readonly authenticate: (session: AuthSession) => void;
}

export function SignInPage({ sessionState }: { readonly sessionState: SignInSessionState }) {
  const [searchParams] = useSearchParams();
  const continuePath = sanitizeContinuePath(searchParams.get("continue"));
  if (sessionState.session) return <ExternalRedirect to={continuePath} />;

  const authenticated = (session: AuthSession) => {
    sessionState.authenticate(session);
    window.location.assign(continuePath);
  };

  return <><SiteAppHeader /><main><SignIn onAuthenticated={authenticated} /></main></>;
}
