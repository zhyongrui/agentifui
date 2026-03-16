'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  defaultLocale,
  getMessages,
  localeStorageKey,
  resolveStoredLocale,
  type AppLocale,
} from '../lib/i18n';

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (nextLocale: AppLocale) => void;
  messages: ReturnType<typeof getMessages>;
  formatDateTime: (value: string | Date | null | undefined, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  children: ReactNode;
};

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    const nextLocale = resolveStoredLocale(window.localStorage.getItem(localeStorageKey));

    if (nextLocale !== locale) {
      setLocaleState(nextLocale);
    }
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale(nextLocale) {
        setLocaleState(nextLocale);
      },
      messages: getMessages(locale),
      formatDateTime(value, fallback) {
        if (!value) {
          return fallback ?? getMessages(locale).adminApps.never;
        }

        const date = value instanceof Date ? value : new Date(value);
        return new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(date);
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider.');
  }

  return context;
}
