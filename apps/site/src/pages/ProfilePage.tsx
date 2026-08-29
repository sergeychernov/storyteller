import { ProfileAvatar, type Profile } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { LanguageSwitcher, useLocalization } from "../localization.js";
import styles from "./ProfilePage.module.css";

interface ProfilePageProps {
  readonly profile: Profile;
  readonly onLanguageChange: (locale: Locale) => Promise<void>;
}

export function ProfilePage({ profile, onLanguageChange }: ProfilePageProps) {
  const { t } = useLocalization();

  return (
    <main className={styles.page}>
      <a className={styles.back} href="/app">← {t("profile.back")}</a>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{t("profile.eyebrow")}</p>
        <div className={styles.identity}>
          <ProfileAvatar className={styles.avatar} profile={profile} size={192} />
          <h1>{t("profile.title")}</h1>
        </div>
        <dl className={styles.details}>
          <div><dt>{t("profile.name")}</dt><dd>{profile.name}</dd></div>
          <div><dt>{t("profile.email")}</dt><dd>{profile.email}</dd></div>
        </dl>
        <div className={styles.preference}>
          <LanguageSwitcher onLocaleChange={onLanguageChange} />
          <p>{t("profile.languageHint")}</p>
        </div>
      </section>
    </main>
  );
}
