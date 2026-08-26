import { localeOptions, normalizeLocale, translate, type Locale, type TranslationKey } from "@storyteller/localization";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import styles from "./localization.module.css";

const storageKey = "storyteller.locale";

interface LocalizationContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(() => normalizeLocale(localStorage.getItem(storageKey) ?? navigator.language));

  useEffect(() => {
    localStorage.setItem(storageKey, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error("useLocalization must be used inside LocalizationProvider");
  return context;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocalization();
  return (
    <label className={styles.languageSwitcher}>
      <span>{t("language.label")}</span>
      <select aria-label={t("language.label")} value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        {localeOptions.map((option) => <option key={option.locale} value={option.locale}>{option.label}</option>)}
      </select>
    </label>
  );
}
