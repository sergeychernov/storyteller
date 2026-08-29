import { useLocalization } from "@storyteller/web-ui";
import styles from "./AccessStatus.module.css";

export function AccessStatus({ state }: { readonly state: "loading" | "error" | "denied" }) {
  const { t } = useLocalization();
  const title = state === "loading" ? t("web.access.loading")
    : state === "denied" ? t("web.access.deniedTitle") : t("common.error");
  const body = state === "loading" ? undefined
    : state === "denied" ? t("web.access.deniedBody") : t("web.access.errorBody");
  return <main className={styles.status} aria-live="polite">
    <section className={styles.card}>
      <h1>{title}</h1>
      {body && <p>{body}</p>}
    </section>
  </main>;
}
