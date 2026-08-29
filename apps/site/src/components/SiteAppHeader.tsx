import { ProfileAvatar, type Profile } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { LanguageSwitcher } from "../localization.js";
import { useLocalization } from "../localization.js";
import styles from "./SiteAppHeader.module.css";

interface SiteAppHeaderProps {
  readonly profile?: Profile;
  readonly onLanguageChange?: (locale: Locale) => Promise<void>;
}

export function SiteAppHeader({ profile, onLanguageChange }: SiteAppHeaderProps) {
  const { t } = useLocalization();
  return (
    <header className={styles.header}>
      <a className={styles.brand} href="/">Make It a Story</a>
      <div className={styles.actions}>
        <LanguageSwitcher onLocaleChange={onLanguageChange} />
        {profile && <a className={styles.avatarLink} href="/app/profile" aria-label={t("profile.open")}>
          <ProfileAvatar className={styles.avatar} profile={profile} />
        </a>}
      </div>
    </header>
  );
}
