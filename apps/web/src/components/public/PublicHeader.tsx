import { Link } from "react-router-dom";
import { LanguageSwitcher } from "../../localization.js";
import styles from "./PublicHeader.module.css";

export function PublicHeader() {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} to="/">Storyteller <span>Studio</span></Link>
      <LanguageSwitcher />
    </header>
  );
}
