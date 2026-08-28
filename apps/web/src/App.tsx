import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppHeader } from "./components/AppHeader.js";
import { SignIn } from "./components/SignIn.js";
import { isPublicSitePath, publicPages } from "./components/public/public-site-model.js";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout.js";
import { PublicPage } from "./pages/PublicPage.js";
import { StoriesPage } from "./pages/StoriesPage.js";
import { StoryPage } from "./pages/StoryPage.js";
import { usePersistentSession } from "./use-persistent-session.js";

export function App() {
  const { session, authenticate } = usePersistentSession();
  const { pathname } = useLocation();
  const defaultPath = session ? "/stories" : "/sign-in";
  const editingStory = /^\/stories\/[^/]+(?:\/scenes\/[^/]+)?\/?$/.test(pathname);
  const publicPath = pathname === "/" || isPublicSitePath(pathname);

  return (
    <div>
      {!editingStory && !publicPath && <AppHeader />}
      <Routes>
        {publicPages.map((resolvedPage) => (
          <Route key={resolvedPage.page.path} path={resolvedPage.page.path} element={<PublicPage resolvedPage={resolvedPage} studioPath={defaultPath} />} />
        ))}
        <Route path="/sign-in" element={session ? <Navigate to="/stories" replace /> : <main><SignIn onAuthenticated={authenticate} /></main>} />
        <Route element={session ? <AuthenticatedLayout /> : <Navigate to="/sign-in" replace />}>
          <Route path="/stories" element={<StoriesPage session={session!} />} />
          <Route path="/stories/:storyId" element={<StoryPage session={session!} />} />
          <Route path="/stories/:storyId/scenes/:sceneId" element={<StoryPage session={session!} />} />
        </Route>
        <Route path="*" element={<Navigate to={defaultPath} replace />} />
      </Routes>
    </div>
  );
}
