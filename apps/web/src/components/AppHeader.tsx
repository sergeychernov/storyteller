import { useQuery } from "@tanstack/react-query";
import { checkHealth } from "../api.js";
import { LanguageSwitcher, useLocalization } from "../localization.js";

export function AppHeader() {
  const { t } = useLocalization();
  const health = useQuery({ queryKey: ["health"], queryFn: checkHealth, refetchInterval: 10_000 });

  return (
    <header className="topbar">
      <a className="brand" href="/">Storyteller <span>Studio</span></a>
      <div className="topbar-actions">
        <LanguageSwitcher />
        <span className={health.data ? "status online" : "status"}>
          {health.data ? t("web.api.online") : t("web.api.offline")}
        </span>
        <span className="avatar">SC</span>
      </div>
    </header>
  );
}
