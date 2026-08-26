import { useQuery } from "@tanstack/react-query";
import { checkHealth } from "../api.js";
import { classNames } from "../class-names.js";
import { LanguageSwitcher, useLocalization } from "../localization.js";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const { t } = useLocalization();
  const health = useQuery({ queryKey: ["health"], queryFn: checkHealth, refetchInterval: 10_000 });

  return (
    <header className={styles.topbar}>
      <a className={styles.brand} href="/">Storyteller <span>Studio</span></a>
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
