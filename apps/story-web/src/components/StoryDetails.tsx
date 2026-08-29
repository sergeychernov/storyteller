import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getStory, type AuthSession } from "../api.js";
import { useLocalization } from "../localization.js";
import feedbackStyles from "../styles/feedback.module.css";
import { StoryEditor } from "./editor/StoryEditor.js";
import { useStorySceneSelection } from "./editor/use-story-scene-selection.js";
import styles from "./StoryDetails.module.css";

interface StoryDetailsProps { readonly session: AuthSession; readonly storyId: string; readonly sceneId: string | undefined }

export function StoryDetails({ session, storyId, sceneId }: StoryDetailsProps) {
  const { t } = useLocalization();
  const story = useQuery({
    queryKey: ["story", storyId],
    queryFn: ({ signal }) => getStory(session.accessToken, storyId, signal),
  });
  const selection = useStorySceneSelection(storyId, sceneId, story.data);

  if (story.data) return <StoryEditor
    key={storyId}
    story={story.data}
    session={session}
    selectedId={selection.selectedId}
    onSelect={selection.onSelect}
  />;

  return <section className={styles.loading}>
    <Link className={feedbackStyles.backLink} to="/">← {t("web.story.back")}</Link>
    {story.isError ? <p className={feedbackStyles.error}>{t("common.error")}</p> : <div className={feedbackStyles.emptyCard}>{t("web.story.loading")}</div>}
  </section>;
}
