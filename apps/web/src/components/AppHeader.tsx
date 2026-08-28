import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { checkHealth } from "../api.js";
import { classNames } from "../class-names.js";
import { getPageByKey } from "./public/public-site-model.js";
import { LanguageSwitcher, useLocalization } from "../localization.js";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const { locale, t } = useLocalization();
  const health = useQuery({ queryKey: ["health"], queryFn: checkHealth, refetchInterval: 10_000 });

  return (
    <header className={styles.topbar}>
      <Link className={styles.brand} to={getPageByKey(locale, "home").path}>Make It a Story <span>Studio</span></Link>
      <div className={styles.actions}>
        <LanguageSwitcher />
        <span className={classNames(styles.status, health.data && styles.online)}>
          {health.data ? t("web.api.online") : t("web.api.offline")}
        </span>
        <span className={styles.avatar}>SC</span>
      </div>
    </header>
  );
}
