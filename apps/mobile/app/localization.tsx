import AsyncStorage from "@react-native-async-storage/async-storage";
import { localeOptions, normalizeLocale, translate, type Locale, type TranslationKey } from "@storyteller/localization";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

const storageKey = "storyteller.locale";

interface LocalizationContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: PropsWithChildren) {
  const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
  const [locale, updateLocale] = useState<Locale>(() => normalizeLocale(systemLocale));

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((storedLocale) => {
      if (storedLocale) updateLocale(normalizeLocale(storedLocale));
    });
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    updateLocale(nextLocale);
    void AsyncStorage.setItem(storageKey, nextLocale);
  }, []);
  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>) => translate(locale, key, params), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error("useLocalization must be used inside LocalizationProvider");
  return context;
}

export { localeOptions };
