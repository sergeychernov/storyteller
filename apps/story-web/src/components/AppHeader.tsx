import { useQuery } from "@tanstack/react-query";
import { ProfileAvatar, type Profile } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { checkHealth } from "../api.js";
import { classNames } from "../class-names.js";
import { BrandMark, LanguageSwitcher, useLocalization } from "@storyteller/web-ui";
import styles from "./AppHeader.module.css";

export function AppHeader({ profile, onLanguageChange }: {
  readonly profile: Profile;
  readonly onLanguageChange: (locale: Locale) => Promise<void>;
}) {
  const { t } = useLocalization();
  const health = useQuery({ queryKey: ["health"], queryFn: checkHealth, refetchInterval: 10_000 });

  return (
    <header className={styles.topbar}>
      <a aria-label="Make It a Story" className={styles.brand} href="/">
        <BrandMark className={styles.brandMark} />
        <span className={styles.brandName}>Make It a Story</span>
        <span className={styles.productName}>Story Studio</span>
      </a>
      <div className={styles.actions}>
        <LanguageSwitcher onLocaleChange={onLanguageChange} />
        <span className={classNames(styles.status, health.data && styles.online)}>
          {health.data ? t("web.api.online") : t("web.api.offline")}
        </span>
        <a className={styles.avatarLink} href="/app/profile" aria-label={t("profile.open")}>
          <ProfileAvatar className={styles.avatar} profile={profile} />
        </a>
      </div>
    </header>
  );
}
