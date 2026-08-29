import { Link } from "react-router-dom";
import { LanguageSwitcher } from "../../localization.js";
import { useLocalization } from "../../localization.js";
import { getLocalizedVersions, getPageByKey, publicSite } from "./public-site-model.js";
import type { PublicPageKey, ResolvedPublicPage } from "./public-site-types.js";
import styles from "./PublicHeader.module.css";

interface PublicHeaderProps {
  readonly resolvedPage: ResolvedPublicPage;
  readonly profile?: Profile | undefined;
  readonly studioPath: string;
  readonly onLanguageChange?: ((locale: Locale) => Promise<void>) | undefined;
}

export function PublicHeader({ resolvedPage, profile, studioPath, onLanguageChange }: PublicHeaderProps) {
  const { locale, localeData, page } = resolvedPage;
  const { t } = useLocalization();
  const languageVersions = getLocalizedVersions(page.key);

  return (
    <header className={styles.header}>
      <Link className={styles.brand} to={getPageByKey(locale, "home").path}>{publicSite.brand}<span>{localeData.brandTagline}</span></Link>
      <nav className={styles.navigation} aria-label={localeData.primaryNavigation}>
        {Object.entries(localeData.nav).map(([key, label]) => {
          const target = getPageByKey(locale, key as PublicPageKey);
          return <Link key={key} to={target.path} aria-current={target.key === page.key ? "page" : undefined}>{label}</Link>;
        })}
      </nav>
      <div className={styles.actions}>
        <LanguageSwitcher destinations={Object.fromEntries(languageVersions.map((version) => [version.locale, version.page.path]))}
          onLocaleChange={onLanguageChange} />
        <Link className={styles.studio} to={studioPath}>{localeData.openStudio}<span aria-hidden="true">↗</span></Link>
        {profile && <Link className={styles.avatarLink} to="/app/profile" aria-label={t("profile.open")}>
          <ProfileAvatar className={styles.avatar} profile={profile} />
        </Link>}
      </div>
    </header>
  );
}
import { ProfileAvatar, type Profile } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
