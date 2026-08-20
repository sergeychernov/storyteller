import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { checkHealth, createAccount, createStory, listStories, type Account, type StorySummary } from "./api.js";

export function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [selectedStory, setSelectedStory] = useState<StorySummary | null>(null);
  const health = useQuery({ queryKey: ["health"], queryFn: checkHealth, refetchInterval: 10_000 });

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">Storyteller <span>Studio</span></a>
        <div className="topbar-actions">
          <span className={health.data ? "status online" : "status"}>{health.data ? "API online" : "API offline"}</span>
          <span className="avatar">SC</span>
        </div>
      </header>

      <main>
        {!account ? <Welcome onCreated={setAccount} /> : (
          <Workspace account={account} selectedStory={selectedStory} onSelectStory={setSelectedStory} />
        )}
      </main>
    </div>
  );
}

function Welcome({ onCreated }: { onCreated: (account: Account) => void }) {
  const [name, setName] = useState("");
  const mutation = useMutation({ mutationFn: () => createAccount(name), onSuccess: onCreated });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) mutation.mutate();
  }

  return (
    <section className="welcome">
      <p className="eyebrow">Your production space</p>
      <h1>Turn raw moments into<br /><em>finished stories.</em></h1>
      <p className="welcome-copy">Start with a lightweight studio for scenes, narration, music and publishing. The workflow grows with the product.</p>
      <form className="account-form" onSubmit={submit}>
        <input aria-label="Your name" value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" />
        <button disabled={mutation.isPending}>{mutation.isPending ? "Creating…" : "Enter studio →"}</button>
      </form>
      {mutation.error && <p className="error">{mutation.error.message}</p>}
    </section>
  );
}

function Workspace({ account, selectedStory, onSelectStory }: {
  account: Account;
  selectedStory: StorySummary | null;
  onSelectStory: (story: StorySummary) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const stories = useQuery({ queryKey: ["stories", account.id], queryFn: () => listStories(account.id) });
  const create = useMutation({
    mutationFn: () => createStory(account.id, title),
    onSuccess: async (story) => {
      setTitle("");
      onSelectStory(story);
      await queryClient.invalidateQueries({ queryKey: ["stories", account.id] });
    },
  });

  return (
    <div className="workspace">
      <aside className="sidebar">
        <p className="sidebar-label">Workspace</p>
        <h2>{account.name}</h2>
        <nav><button className="nav-active">Stories</button><button>Assets</button><button>Connections</button></nav>
        <div className="sidebar-foot">MVP foundation<br /><span>In-memory data</span></div>
      </aside>

      <section className="content">
        <div className="content-head">
          <div><p className="eyebrow">Production library</p><h1>Your stories</h1></div>
          <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate(); }}>
            <input aria-label="Story title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="New story title" />
            <button disabled={create.isPending}>+ New story</button>
          </form>
        </div>

        <div className="story-grid">
          {stories.data?.map((story) => (
            <button className={selectedStory?.id === story.id ? "story-card selected" : "story-card"} key={story.id} onClick={() => onSelectStory(story)}>
              <span className="story-preview">{story.title?.slice(0, 1).toUpperCase()}</span>
              <span className="story-info"><strong>{story.title}</strong><small>{story.sceneCount} scenes · {story.status}</small></span>
              <span>↗</span>
            </button>
          ))}
          {!stories.isLoading && stories.data?.length === 0 && <div className="empty-card">Create your first story to open the editor.</div>}
        </div>

        <EditorShell story={selectedStory} />
      </section>
    </div>
  );
}

function EditorShell({ story }: { story: StorySummary | null }) {
  return (
    <section className={story ? "editor" : "editor muted"}>
      <div className="editor-head"><div><p className="eyebrow">Story editor</p><h2>{story?.title ?? "Select a story"}</h2></div><button disabled={!story}>Preview story</button></div>
      <div className="editor-body">
        <div className="scene-list"><span>Scenes</span><div className="scene-placeholder">01<br /><small>First scene</small></div><button disabled={!story}>+ Add scene</button></div>
        <div className="canvas"><div className="phone-frame"><span>{story ? "Your scene preview" : "Preview"}</span></div></div>
        <div className="inspector"><span>Scene settings</span><label>Title<input disabled placeholder="Add a title" /></label><label>Renderer<select disabled><option>Choose renderer</option></select></label></div>
      </div>
      <div className="timeline"><span>Timeline</span><div className="track"><i /></div><small>00:00</small></div>
    </section>
  );
}
