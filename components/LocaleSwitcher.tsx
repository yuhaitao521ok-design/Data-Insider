"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, LOCALE_META, useI18n } from "@/lib/i18n";

/** 语言切换：简体中文 / 繁體中文 / English */
export default function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        data-locale-switcher
        aria-label={t("切换语言 / Language")}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t("切换语言 / Language")}
        className={`flex h-8 items-center gap-1 rounded-lg px-2 transition-colors hover:bg-hover ${
          open ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <span className="text-[11px] leading-4">{LOCALE_META[locale].short}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Language"
          className="absolute right-0 top-full z-50 mt-1.5 w-[148px] rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-pop)] rise"
        >
          {LOCALES.map((item) => {
            const active = item === locale;
            return (
              <button
                key={item}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLocale(item);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors ${
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-foreground/85 hover:bg-hover hover:text-foreground"
                }`}
              >
                {LOCALE_META[item].label}
                {active && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="m5 12.5 4.5 4.5L19 7"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
