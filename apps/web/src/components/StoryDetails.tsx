import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getStory, type AuthSession } from "../api.js";
import { useLocalization } from "../localization.js";
import feedbackStyles from "../styles/feedback.module.css";
import { StoryEditor } from "./editor/StoryEditor.js";
import styles from "./StoryDetails.module.css";

interface StoryDetailsProps { readonly session: AuthSession; readonly storyId: string; readonly sceneId: string | undefined }

export function StoryDetails({ session, storyId, sceneId }: StoryDetailsProps) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const story = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => getStory(session.accessToken, storyId),
  });
  const selectedId = story.data?.scenes.some(({ id }) => id === sceneId)
    ? sceneId ?? ""
    : story.data?.scenes[0]?.id ?? "";

  useEffect(() => {
    if (!story.data || !selectedId || sceneId === selectedId) return;
    navigate(`/stories/${storyId}/scenes/${selectedId}`, { replace: true });
  }, [navigate, sceneId, selectedId, story.data, storyId]);

  if (story.data) return <StoryEditor
    story={story.data}
    session={session}
    selectedId={selectedId}
    onSelect={(id) => navigate(`/stories/${storyId}/scenes/${id}`, { replace: true })}
  />;

  return <section className={styles.loading}>
    <Link className={feedbackStyles.backLink} to="/stories">← {t("web.story.back")}</Link>
    {story.isError ? <p className={feedbackStyles.error}>{t("common.error")}</p> : <div className={feedbackStyles.emptyCard}>{t("web.story.loading")}</div>}
  </section>;
}
