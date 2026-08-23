import { useQuery } from "@tanstack/react-query";
import type { TranslationKey } from "@storyteller/localization";
import { Link } from "react-router-dom";
import { getStory, type AuthSession } from "../api.js";
import { useLocalization } from "../localization.js";

interface StoryDetailsProps { readonly session: AuthSession; readonly storyId: string }

export function StoryDetails({ session, storyId }: StoryDetailsProps) {
  const { t } = useLocalization();
  const story = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => getStory(session.accessToken, storyId),
  });

  return (
    <section className="content">
      <Link className="back-link" to="/stories">← {t("web.story.back")}</Link>
      {story.data ? <>
        <div className="content-head story-head">
          <div><p className="eyebrow">{t("web.story.eyebrow")}</p><h1>{story.data.title}</h1></div>
          <span className="story-status">{t(`common.status.${story.data.status}` as TranslationKey)}</span>
        </div>
        <div className="empty-card story-empty">{t("web.story.empty")}</div>
      </> : story.isError
        ? <p className="error">{t("common.error")}</p>
        : <div className="empty-card">{t("web.story.loading")}</div>}
    </section>
  );
}
