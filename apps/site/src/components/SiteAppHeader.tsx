import { ProfileAvatar, type Profile } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { BrandMark, LanguageSwitcher, useLocalization } from "@storyteller/web-ui";
import styles from "./SiteAppHeader.module.css";

interface SiteAppHeaderProps {
  readonly profile?: Profile;
  readonly onLanguageChange?: (locale: Locale) => Promise<void>;
}

export function SiteAppHeader({ profile, onLanguageChange }: SiteAppHeaderProps) {
  const { t } = useLocalization();
  return (
    <header className={styles.header}>
      <a aria-label="Make It a Story" className={styles.brand} href="/">
        <BrandMark className={styles.brandMark} />
        <span>Make It a Story</span>
      </a>
      <div className={styles.actions}>
        <LanguageSwitcher onLocaleChange={onLanguageChange} />
        {profile && <a className={styles.avatarLink} href="/app/profile" aria-label={t("profile.open")}>
          <ProfileAvatar className={styles.avatar} profile={profile} />
        </a>}
      </div>
    </header>
  );
}
