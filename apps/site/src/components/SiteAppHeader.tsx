import { LanguageSwitcher } from "../localization.js";
import styles from "./SiteAppHeader.module.css";

export function SiteAppHeader() {
  return (
    <header className={styles.header}>
      <a className={styles.brand} href="/">Make It a Story</a>
      <LanguageSwitcher />
    </header>
  );
}
