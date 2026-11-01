"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { I18nContext, LOCALE_META, isLocale, translate, type Locale } from "@/lib/i18n";

const LOCALE_KEY = "data-insider:locale:v1";

function detectLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY);
    if (isLocale(saved)) return saved;

    const lang = (window.navigator.language || "zh").toLowerCase();
    if (lang.startsWith("zh")) {
      return /hant|tw|hk|mo/.test(lang) ? "zh-Hant" : "zh-Hans";
    }
    if (lang.startsWith("en")) return "en";
  } catch {
    // 隐私模式等场景忽略
  }
  return "zh-Hans";
}

/** 语言上下文：持久化到 localStorage，并同步 <html lang> */
export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh-Hans");

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = LOCALE_META[locale].htmlLang;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // 忽略写入失败
    }
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (text: string) => translate(text, locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
