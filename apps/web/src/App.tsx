import { useState } from "react";
import type { StorySummary } from "./api.js";
import { AppHeader } from "./components/AppHeader.js";
import { SignIn } from "./components/SignIn.js";
import { Workspace } from "./components/Workspace.js";
import { usePersistentSession } from "./use-persistent-session.js";

export function App() {
  const { session, authenticate } = usePersistentSession();
  const [selectedStory, setSelectedStory] = useState<StorySummary | null>(null);

  return (
    <div className="app-shell">
      <AppHeader />
      <main>
        {session
          ? <Workspace session={session} selectedStory={selectedStory} onSelectStory={setSelectedStory} />
          : <SignIn onAuthenticated={authenticate} />}
      </main>
    </div>
  );
}
