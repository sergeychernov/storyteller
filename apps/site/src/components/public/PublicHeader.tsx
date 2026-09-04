import { ProfileAvatar, type Profile } from "@storyteller/auth-client";
import type { Locale } from "@storyteller/localization";
import { BrandMark, LanguageSwitcher, useLocalization } from "@storyteller/web-ui";
import { Link, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const languageVersions = getLocalizedVersions(page.key);

  return (
    <header className={styles.header}>
      <Link aria-label={publicSite.brand} className={styles.brand} to={getPageByKey(locale, "home").path}>
        <BrandMark className={styles.brandMark} />
        <span className={styles.brandCopy}>
          <span className={styles.brandName}>{publicSite.brand}</span>
          <span className={styles.brandTagline}>{localeData.brandTagline}</span>
        </span>
      </Link>
      <nav className={styles.navigation} aria-label={localeData.primaryNavigation}>
        {Object.entries(localeData.nav).map(([key, label]) => {
          const target = getPageByKey(locale, key as PublicPageKey);
          return <Link key={key} to={target.path} aria-current={target.key === page.key ? "page" : undefined}>{label}</Link>;
        })}
      </nav>
      <div className={styles.actions}>
        <LanguageSwitcher destinations={Object.fromEntries(languageVersions.map((version) => [version.locale, version.page.path]))}
          onLocaleChange={onLanguageChange} onNavigate={navigate} />
        <Link className={styles.studio} to={studioPath}>{localeData.openStudio}<span aria-hidden="true">↗</span></Link>
        {profile && <Link className={styles.avatarLink} to="/app/profile" aria-label={t("profile.open")}>
          <ProfileAvatar className={styles.avatar} profile={profile} />
        </Link>}
      </div>
    </header>
  );
}
