import { ProfileAvatar, type Profile } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { BrandMark, LanguageSwitcher, useLocalization } from "@storyteller/web-ui";
import styles from "./ClipShell.module.css";

const copy: Record<Locale, {
  status: string;
  title: string;
  body: string;
  detail: string;
  back: string;
  home: string;
  greeting: (name: string) => string;
}> = {
  en: {
    status: "Workspace boundary ready · product planned",
    title: "Clip Studio",
    body: "A separate editing experience for music performances belongs here.",
    detail: "Multicamera synchronization, clip projects and rendering are planned for milestone P5. This shell does not accept files or simulate an editor.",
    back: "Choose another studio",
    home: "Public site",
    greeting: (name) => `Signed in as ${name}`,
  },
  ru: {
    status: "Граница приложения готова · продукт запланирован",
    title: "Clip Studio",
    body: "Здесь появится отдельный интерфейс монтажа музыкальных выступлений.",
    detail: "Multicamera-синхронизация, ClipProject и рендер запланированы на milestone P5. Этот shell не принимает файлы и не имитирует редактор.",
    back: "Выбрать другую студию",
    home: "Публичный сайт",
    greeting: (name) => `Вы вошли как ${name}`,
  },
  "sr-Latn": {
    status: "Granica aplikacije je spremna · proizvod je planiran",
    title: "Clip Studio",
    body: "Ovde će biti poseban interfejs za montažu muzičkih izvođenja.",
    detail: "Multikamera sinhronizacija, ClipProject i renderovanje planirani su za milestone P5. Ovaj okvir ne prima fajlove i ne imitira editor.",
    back: "Izaberi drugi studio",
    home: "Javni sajt",
    greeting: (name) => `Prijavljeni ste kao ${name}`,
  },
  es: {
    status: "El límite de la aplicación está listo · producto previsto",
    title: "Clip Studio",
    body: "Aquí habrá una experiencia de edición independiente para actuaciones musicales.",
    detail: "La sincronización multicámara, los proyectos de clips y el renderizado están previstos para el milestone P5. Esta estructura no acepta archivos ni simula un editor.",
    back: "Elegir otro estudio",
    home: "Sitio público",
    greeting: (name) => `Sesión iniciada como ${name}`,
  },
};

export function ClipShell({ profile, onLanguageChange }: {
  readonly profile: Profile;
  readonly onLanguageChange: (locale: Locale) => Promise<void>;
}) {
  const { locale, t } = useLocalization();
  const text = copy[locale];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a aria-label="Make It a Story" className={styles.brand} href="/">
          <BrandMark className={styles.brandMark} />
          <span className={styles.brandName}>Make It a Story</span>
          <span className={styles.productName}>Clip Studio</span>
        </a>
        <div className={styles.actions}>
          <LanguageSwitcher onLocaleChange={onLanguageChange} />
          <a className={styles.avatarLink} href="/app/profile" aria-label={t("profile.open")}>
            <ProfileAvatar className={styles.avatar} profile={profile} />
          </a>
        </div>
      </header>
      <main className={styles.content}>
        <p className={styles.status}>{text.status}</p>
        <h1>{text.title}</h1>
        <p className={styles.lead}>{text.body}</p>
        <p className={styles.detail}>{text.detail}</p>
        <p className={styles.profile}>{text.greeting(profile.name)}</p>
        <nav>
          <a className={styles.primary} href="/app">{text.back}</a>
          <a href="/">{text.home}</a>
        </nav>
      </main>
    </div>
  );
}
