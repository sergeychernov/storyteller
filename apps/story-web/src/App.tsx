import { Navigate, Route, Routes, useLocation, useMatch } from "react-router-dom";
import { createSignInPath } from "@storyteller/auth-client";
import { AppHeader } from "./components/AppHeader.js";
import { ExternalRedirect } from "./components/ExternalRedirect.js";
import { AuthenticatedLayout } from "./layouts/AuthenticatedLayout.js";
import { StoriesPage } from "./pages/StoriesPage.js";
import { StoryPage } from "./pages/StoryPage.js";
import { usePersistentSession } from "./use-persistent-session.js";

export function App() {
  const { session } = usePersistentSession();
  const location = useLocation();
  const editingStory = useMatch("/:storyId/*");

  if (!session) {
    return <ExternalRedirect to={createSignInPath(`/app/stories${location.pathname}${location.search}`)} />;
  }

  return (
    <div>
      {!editingStory && <AppHeader />}
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
