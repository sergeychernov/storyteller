import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useLocalization } from "@storyteller/web-ui";
import feedbackStyles from "@storyteller/web-ui/feedback.module.css";
import { useCapability } from "../../access-control.js";
import { getStory, type AuthSession } from "../../api.js";
import { useStoryTimeline } from "../editor/use-story-timeline.js";
import { storyEditorPath } from "../editor/scene-deletion-model.js";
import { getPreviewCopy } from "./preview-copy.js";
import { timelineMatchesStory } from "./story-preview-model.js";
import { StoryPreview } from "./StoryPreview.js";
import styles from "./StoryPreview.module.css";

export function StoryPreviewDetails({ session, storyId }: { readonly session: AuthSession; readonly storyId: string }) {
  const { locale } = useLocalization();
  const copy = getPreviewCopy(locale);
  const canReadStory = useCapability("story.read");
  const story = useQuery({
    queryKey: ["story", storyId],
    queryFn: ({ signal }) => getStory(session.csrfToken, storyId, signal),
    enabled: canReadStory,
  });
  const timeline = useStoryTimeline(session, storyId, story.data?.revision ?? -1, Boolean(story.data));
  const fallback = storyEditorPath(storyId, story.data?.scenes[0]?.id ?? "");

  if (story.data && timeline.data && timelineMatchesStory(timeline.data, story.data)) {
    return <StoryPreview key={storyId} story={story.data} timeline={timeline.data} session={session} />;
  }

  const failed = story.isError || timeline.isError || !canReadStory;
  return <section className={styles.loading} aria-busy={!failed}>
    <Link className={feedbackStyles.backLink} to={fallback}>← {copy.back}</Link>
    <div className={failed ? feedbackStyles.error : feedbackStyles.emptyCard} role={failed ? "alert" : "status"}>
      {failed ? copy.loadError : copy.loading}
    </div>
  </section>;
}
