import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

import en from './en.json';
import ru from './ru.json';

type Locale = 'en' | 'ru';
type Translations = typeof en;

const resources: Record<Locale, Translations> = { en, ru };

function getNestedValue(obj: Record<string, any>, path: string): string {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current[key] === undefined) return path;
    current = current[key];
  }
  return typeof current === 'string' ? current : path;
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? _);
}

type I18nContextValue = {
  t: (key: string, params?: Record<string, string>) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'admin-locale';

function getInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ru') return stored;
  } catch {}
  return 'ru';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const value = getNestedValue(resources[locale], key);
      return params ? interpolate(value, params) : value;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
