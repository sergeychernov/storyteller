import { usePersistentSession } from "@storyteller/auth-client";
import { Navigate, Route, Routes } from "react-router-dom";
import { authClient } from "./auth.js";
import { ProductChooser } from "./components/ProductChooser.js";
import { SiteAppHeader } from "./components/SiteAppHeader.js";
import { publicPages } from "./components/public/public-site-model.js";
import { PublicPage } from "./pages/PublicPage.js";
import { SignInPage } from "./pages/SignInPage.js";

export function App() {
  const sessionState = usePersistentSession(authClient);
  const studioPath = sessionState.session ? "/app" : "/sign-in?continue=%2Fapp";

  return (
    <Routes>
      {publicPages.map((resolvedPage) => (
        <Route key={resolvedPage.page.path} path={resolvedPage.page.path} element={<PublicPage resolvedPage={resolvedPage} studioPath={studioPath} />} />
      ))}
      <Route path="/sign-in" element={<SignInPage sessionState={sessionState} />} />
      <Route path="/app" element={sessionState.session
        ? <><SiteAppHeader /><ProductChooser session={sessionState.session} onSignOut={sessionState.clearSession} /></>
        : <Navigate to="/sign-in?continue=%2Fapp" replace />} />
      <Route path="*" element={<main><h1>Page not found</h1><a href="/">Make It a Story</a></main>} />
    </Routes>
  );
}
