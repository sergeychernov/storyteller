import type { AuthSession } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { useLocalization } from "../localization.js";
import styles from "./ProductChooser.module.css";

const copy: Record<Locale, {
  eyebrow: string;
  title: string;
  welcome: (name: string) => string;
  storyTitle: string;
  storyBody: string;
  storyAction: string;
  clipTitle: string;
  clipBody: string;
  clipAction: string;
  planned: string;
  signOut: string;
}> = {
  en: {
    eyebrow: "Your workspace",
    title: "Choose a studio",
    welcome: (name) => `Welcome back, ${name}.`,
    storyTitle: "Story Studio",
    storyBody: "Build stories from your photos, videos, narration and music.",
    storyAction: "Open Story Studio →",
    clipTitle: "Clip Studio",
    clipBody: "The separate music-video workspace is prepared for a later product milestone.",
    clipAction: "View planned workspace →",
    planned: "Planned",
    signOut: "Sign out",
  },
  ru: {
    eyebrow: "Ваше пространство",
    title: "Выберите студию",
    welcome: (name) => `С возвращением, ${name}.`,
    storyTitle: "Story Studio",
    storyBody: "Собирайте истории из фото, видео, озвучки и музыки.",
    storyAction: "Открыть Story Studio →",
    clipTitle: "Clip Studio",
    clipBody: "Отдельное приложение для музыкальных клипов подготовлено для будущего milestone.",
    clipAction: "Посмотреть будущую студию →",
    planned: "Запланировано",
    signOut: "Выйти",
  },
  "sr-Latn": {
    eyebrow: "Vaš prostor",
    title: "Izaberite studio",
    welcome: (name) => `Dobro došli nazad, ${name}.`,
    storyTitle: "Story Studio",
    storyBody: "Pravite priče od fotografija, snimaka, naracije i muzike.",
    storyAction: "Otvori Story Studio →",
    clipTitle: "Clip Studio",
    clipBody: "Poseban prostor za muzičke spotove pripremljen je za kasniji milestone.",
    clipAction: "Pogledaj planirani studio →",
    planned: "Planirano",
    signOut: "Odjavi se",
  },
};

export function ProductChooser({ session, onSignOut }: { readonly session: AuthSession; readonly onSignOut: () => void }) {
  const { locale } = useLocalization();
  const text = copy[locale];

  return (
    <main className={styles.page}>
      <header className={styles.intro}>
        <p>{text.eyebrow}</p>
        <h1>{text.title}</h1>
        <span>{text.welcome(session.profile.name)}</span>
      </header>
      <section className={styles.grid} aria-label={text.title}>
        <article className={styles.card}>
          <h2>{text.storyTitle}</h2>
          <p>{text.storyBody}</p>
          <a href="/app/stories">{text.storyAction}</a>
        </article>
        <article className={styles.card}>
          <span className={styles.badge}>{text.planned}</span>
          <h2>{text.clipTitle}</h2>
          <p>{text.clipBody}</p>
          <a href="/app/clips">{text.clipAction}</a>
        </article>
      </section>
      <button className={styles.signOut} type="button" onClick={onSignOut}>{text.signOut}</button>
    </main>
  );
}
