import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStory, listStories, type AuthSession } from "../api.js";
import { useLocalization } from "../localization.js";
import feedbackStyles from "../styles/feedback.module.css";
import typographyStyles from "../styles/typography.module.css";
import { StoryCard } from "./StoryCard.js";
import styles from "./StoryLibrary.module.css";

export function StoryLibrary({ session }: { readonly session: AuthSession }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const stories = useQuery({ queryKey: ["stories", session.profile.id], queryFn: () => listStories(session.accessToken) });
  const addStory = useMutation({
    mutationFn: () => createStory(session.accessToken, title),
    onSuccess: async (story) => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["stories", session.profile.id] });
      navigate(`/${story.id}`);
    },
  });

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (title.trim()) addStory.mutate();
  }

  return (
    <section className={styles.content}>
      <div className={styles.head}>
        <div><p className={typographyStyles.eyebrow}>{t("web.library.eyebrow")}</p><h1>{t("web.library.title")}</h1></div>
        <form onSubmit={submit}>
          <input aria-label={t("web.library.storyTitle.label")} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("web.library.storyTitle.placeholder")} />
          <button disabled={addStory.isPending}>{t("web.library.newStory")}</button>
        </form>
      </div>
      <div className={styles.grid}>
        {stories.data?.map((story) => <StoryCard story={story} key={story.id} />)}
        {!stories.isLoading && stories.data?.length === 0 && <div className={feedbackStyles.emptyCard}>{t("web.library.empty")}</div>}
      </div>
    </section>
  );
}
