import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TranslationKey } from "@storyteller/localization";
import { useState } from "react";
import { createProject, createStory, listProjects, listStories, type AuthSession, type Project, type StorySummary } from "../api.js";
import { useLocalization } from "../localization.js";
import { EditorShell } from "./EditorShell.js";

interface WorkspaceProps {
  readonly session: AuthSession;
  readonly selectedStory: StorySummary | null;
  readonly onSelectStory: (story: StorySummary) => void;
}

export function Workspace({ session, selectedStory, onSelectStory }: WorkspaceProps) {
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
  const addStory = useMutation({
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
          {project ? <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) addStory.mutate(); }}>
            <input aria-label={t("web.library.storyTitle.label")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("web.library.storyTitle.placeholder")} />
            <button disabled={addStory.isPending}>{t("web.library.newStory")}</button>
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
