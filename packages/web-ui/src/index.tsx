import { localeOptions, normalizeLocale, translate, type Locale, type TranslationKey } from "@storyteller/localization";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
export { BrandMark, type BrandMarkProps } from "./BrandMark.js";
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

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error("useLocalization must be used inside LocalizationProvider");
  return context;
}

interface LanguageSwitcherBaseProps {
  readonly onLocaleChange?: ((locale: Locale) => Promise<void>) | undefined;
}

type LanguageSwitcherProps = LanguageSwitcherBaseProps & (
  | {
    readonly destinations: Readonly<Partial<Record<Locale, string>>>;
    readonly onNavigate: (destination: string) => void;
  }
  | {
    readonly destinations?: never;
    readonly onNavigate?: never;
  }
);

export function LanguageSwitcher(props: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useLocalization();
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  async function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;
    setIsSaving(true);
    setSaveFailed(false);
    try {
      await props.onLocaleChange?.(nextLocale);
      setLocale(nextLocale);
      if (props.destinations) {
        const destination = props.destinations[nextLocale];
        if (destination) props.onNavigate(destination);
      }
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <label className="storyteller-language-switcher">
      <span>{t("language.label")}</span>
      <select
        aria-label={t("language.label")}
        aria-busy={isSaving}
        disabled={isSaving}
        value={locale}
        onChange={(event) => {
          void changeLocale(event.target.value as Locale);
        }}
      >
        {localeOptions.map((option) => (
          <option key={option.locale} value={option.locale}>
            {option.label}
          </option>
        ))}
      </select>
      {saveFailed && (
        <span className="storyteller-language-error" role="alert">
          {t("language.saveError")}
        </span>
      )}
    </label>
  );
}

export function ExternalRedirect({ to }: { readonly to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return null;
}
