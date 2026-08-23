import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TranslationKey } from "@storyteller/localization";
import { type FormEvent, useEffect, useState } from "react";
import { ApiError, checkHealth, createProject, createStory, getProfile, listProjects, listStories, login, register, type AuthSession, type Project, type StorySummary } from "./api.js";
import { LanguageSwitcher, useLocalization } from "./localization.js";

export function App() {
  const { t } = useLocalization();
  const [session, setSession] = useState<AuthSession | null>(loadSession);
  const [selectedStory, setSelectedStory] = useState<StorySummary | null>(null);
  const health = useQuery({ queryKey: ["health"], queryFn: checkHealth, refetchInterval: 10_000 });

  useEffect(() => {
    if (!session) return;
    void getProfile(session.accessToken).then((profile) => {
      if (profile.name !== session.profile.name || profile.email !== session.profile.email) {
        storeSession({ ...session, profile });
        setSession({ ...session, profile });
      }
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        setSession(null);
      }
    });
  }, [session?.accessToken]);

  function authenticated(nextSession: AuthSession) {
    storeSession(nextSession);
    setSession(nextSession);
  }

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
        {!session ? <Welcome onCreated={authenticated} /> : (
          <Workspace session={session} selectedStory={selectedStory} onSelectStory={setSelectedStory} />
        )}
      </main>
    </div>
  );
}

const SESSION_STORAGE_KEY = "storyteller.auth-session";

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AuthSession>;
    const expiresAt = typeof session.expiresAt === "string" ? Date.parse(session.expiresAt) : Number.NaN;
    if (!session.accessToken || !session.profile?.id || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session as AuthSession;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function storeSession(session: AuthSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function Welcome({ onCreated }: { onCreated: (session: AuthSession) => void }) {
  const { t } = useLocalization();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"register" | "login">("register");
  const mutation = useMutation({ mutationFn: () => mode === "register" ? register(name, email, password) : login(email, password), onSuccess: onCreated });

  function submit(event: FormEvent) {
    event.preventDefault();
    if ((mode === "login" || name.trim()) && email.trim() && password.length >= 10) mutation.mutate();
  }

  return (
    <section className="welcome">
      <p className="eyebrow">{t("web.welcome.eyebrow")}</p>
      <h1>{t("web.welcome.title.first")}<br /><em>{t("web.welcome.title.second")}</em></h1>
      <p className="welcome-copy">{t("web.welcome.copy")}</p>
      <form className="account-form" onSubmit={submit}>
        {mode === "register" && <input aria-label={t("web.welcome.name.label")} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("web.welcome.name.placeholder")} />}
        <input aria-label={t("web.welcome.email.label")} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("web.welcome.email.placeholder")} />
        <input aria-label={t("web.welcome.password.label")} type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("web.welcome.password.placeholder")} />
        <button disabled={mutation.isPending}>{mutation.isPending ? t("web.welcome.creating") : mode === "register" ? t("web.welcome.enter") : t("web.welcome.login")}</button>
      </form>
      <button className="auth-mode" type="button" onClick={() => { mutation.reset(); setMode(mode === "register" ? "login" : "register"); }}>
        {mode === "register" ? t("web.welcome.haveAccount") : t("web.welcome.needAccount")}
      </button>
      {mutation.error && <p className="error">{t("common.error")}</p>}
    </section>
  );
}

function Workspace({ session, selectedStory, onSelectStory }: {
  session: AuthSession;
  selectedStory: StorySummary | null;
  onSelectStory: (story: StorySummary) => void;
}) {
  const { t } = useLocalization();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [projectName, setProjectName] = useState("");
  const projects = useQuery({ queryKey: ["projects", session.profile.id], queryFn: () => listProjects(session.accessToken) });
  const project: Project | undefined = projects.data?.[0];
  const stories = useQuery({ queryKey: ["stories", project?.id], queryFn: () => listStories(session.accessToken, project!.id), enabled: Boolean(project) });
  const addProject = useMutation({
    mutationFn: () => createProject(session.accessToken, projectName),
    onSuccess: async () => { setProjectName(""); await queryClient.invalidateQueries({ queryKey: ["projects", session.profile.id] }); },
  });
  const create = useMutation({
    mutationFn: () => createStory(session.accessToken, project!.id, title),
    onSuccess: async (story) => {
      setTitle("");
      onSelectStory(story);
      await queryClient.invalidateQueries({ queryKey: ["stories", project?.id] });
    },
  });

  return (
    <div className="workspace">
      <aside className="sidebar">
        <p className="sidebar-label">{t("web.sidebar.workspace")}</p>
        <h2>{session.profile.name}</h2>
        <nav><button className="nav-active">{t("web.sidebar.stories")}</button><button>{t("web.sidebar.assets")}</button><button>{t("web.sidebar.connections")}</button></nav>
        <div className="sidebar-foot">{t("web.sidebar.foundation")}<br /><span>{t("web.sidebar.postgres")}</span></div>
      </aside>

      <section className="content">
        <div className="content-head">
          <div><p className="eyebrow">{t("web.library.eyebrow")}</p><h1>{t("web.library.title")}</h1></div>
          {project ? <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate(); }}>
            <input aria-label={t("web.library.storyTitle.label")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("web.library.storyTitle.placeholder")} />
            <button disabled={create.isPending}>{t("web.library.newStory")}</button>
          </form> : <form onSubmit={(event) => { event.preventDefault(); if (projectName.trim()) addProject.mutate(); }}>
            <input aria-label={t("web.library.projectName.label")} value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder={t("web.library.projectName.placeholder")} />
            <button disabled={addProject.isPending}>{t("web.library.newProject")}</button>
          </form>}
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
