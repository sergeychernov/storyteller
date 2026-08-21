import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TranslationKey } from "@storyteller/localization";
import { type FormEvent, useState } from "react";
import { checkHealth, createAccount, createStory, listStories, type Account, type StorySummary } from "./api.js";
import { LanguageSwitcher, useLocalization } from "./localization.js";

export function App() {
  const { t } = useLocalization();
  const [account, setAccount] = useState<Account | null>(null);
  const [selectedStory, setSelectedStory] = useState<StorySummary | null>(null);
  const health = useQuery({ queryKey: ["health"], queryFn: checkHealth, refetchInterval: 10_000 });

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">Storyteller <span>Studio</span></a>
        <div className="topbar-actions">
          <LanguageSwitcher />
          <span className={health.data ? "status online" : "status"}>{health.data ? t("web.api.online") : t("web.api.offline")}</span>
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
  const { t } = useLocalization();
  const [name, setName] = useState("");
  const mutation = useMutation({ mutationFn: () => createAccount(name), onSuccess: onCreated });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) mutation.mutate();
  }

  return (
    <section className="welcome">
      <p className="eyebrow">{t("web.welcome.eyebrow")}</p>
      <h1>{t("web.welcome.title.first")}<br /><em>{t("web.welcome.title.second")}</em></h1>
      <p className="welcome-copy">{t("web.welcome.copy")}</p>
      <form className="account-form" onSubmit={submit}>
        <input aria-label={t("web.welcome.name.label")} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("web.welcome.name.placeholder")} />
        <button disabled={mutation.isPending}>{mutation.isPending ? t("web.welcome.creating") : t("web.welcome.enter")}</button>
      </form>
      {mutation.error && <p className="error">{t("common.error")}</p>}
    </section>
  );
}

function Workspace({ account, selectedStory, onSelectStory }: {
  account: Account;
  selectedStory: StorySummary | null;
  onSelectStory: (story: StorySummary) => void;
}) {
  const { t } = useLocalization();
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
        <p className="sidebar-label">{t("web.sidebar.workspace")}</p>
        <h2>{account.name}</h2>
        <nav><button className="nav-active">{t("web.sidebar.stories")}</button><button>{t("web.sidebar.assets")}</button><button>{t("web.sidebar.connections")}</button></nav>
        <div className="sidebar-foot">{t("web.sidebar.foundation")}<br /><span>{t("web.sidebar.memory")}</span></div>
      </aside>

      <section className="content">
        <div className="content-head">
          <div><p className="eyebrow">{t("web.library.eyebrow")}</p><h1>{t("web.library.title")}</h1></div>
          <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate(); }}>
            <input aria-label={t("web.library.storyTitle.label")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("web.library.storyTitle.placeholder")} />
            <button disabled={create.isPending}>{t("web.library.newStory")}</button>
          </form>
        </div>

        <div className="story-grid">
          {stories.data?.map((story) => (
            <button className={selectedStory?.id === story.id ? "story-card selected" : "story-card"} key={story.id} onClick={() => onSelectStory(story)}>
              <span className="story-preview">{story.title?.slice(0, 1).toUpperCase()}</span>
              <span className="story-info"><strong>{story.title}</strong><small>{t("web.library.sceneCount", { count: story.sceneCount })} · {t(`common.status.${story.status}` as TranslationKey)}</small></span>
              <span>↗</span>
            </button>
          ))}
          {!stories.isLoading && stories.data?.length === 0 && <div className="empty-card">{t("web.library.empty")}</div>}
        </div>

        <EditorShell story={selectedStory} />
      </section>
    </div>
  );
}

function EditorShell({ story }: { story: StorySummary | null }) {
  const { t } = useLocalization();
  return (
    <section className={story ? "editor" : "editor muted"}>
      <div className="editor-head"><div><p className="eyebrow">{t("web.editor.eyebrow")}</p><h2>{story?.title ?? t("web.editor.select")}</h2></div><button disabled={!story}>{t("web.editor.previewStory")}</button></div>
      <div className="editor-body">
        <div className="scene-list"><span>{t("web.editor.scenes")}</span><div className="scene-placeholder">01<br /><small>{t("web.editor.firstScene")}</small></div><button disabled={!story}>{t("web.editor.addScene")}</button></div>
        <div className="canvas"><div className="phone-frame"><span>{story ? t("web.editor.scenePreview") : t("web.editor.preview")}</span></div></div>
        <div className="inspector"><span>{t("web.editor.settings")}</span><label>{t("web.editor.title")}<input disabled placeholder={t("web.editor.addTitle")} /></label><label>{t("web.editor.renderer")}<select disabled><option>{t("web.editor.chooseRenderer")}</option></select></label></div>
      </div>
      <div className="timeline"><span>{t("web.editor.timeline")}</span><div className="track"><i /></div><small>00:00</small></div>
    </section>
  );
}
