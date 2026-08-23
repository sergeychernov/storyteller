import type { TranslationKey } from "@storyteller/localization";
import { Link } from "react-router-dom";
import type { StorySummary } from "../api.js";
import { useLocalization } from "../localization.js";

export function StoryCard({ story }: { readonly story: StorySummary }) {
  const { t } = useLocalization();
  return (
    <Link className="story-card" to={`/stories/${story.id}`}>
      <span className="story-preview">{story.title?.slice(0, 1).toUpperCase()}</span>
      <span className="story-info">
        <strong>{story.title}</strong>
        <small>{t("web.library.sceneCount", { count: story.sceneCount })} · {t(`common.status.${story.status}` as TranslationKey)}</small>
      </span>
      <span>↗</span>
    </Link>
  );
}
