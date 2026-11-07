"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { NAV_STYLE_KEY, isNavStyle, useNavStyle, type NavStyle } from "@/lib/nav-style";

/** 底部导航风格切换：水晶滑块 / 胶囊徽标，选择持久化 */
export default function NavStyleSwitcher() {
  const { t } = useI18n();
  const [style, setStyle] = useNavStyle();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 首帧后读取一次（与 ThemeToggle 相同的水合策略）
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAV_STYLE_KEY);
      if (isNavStyle(raw)) setStyle(raw);
    } catch {
      // 忽略
    }
  }, [setStyle]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const options: { key: NavStyle; label: string }[] = [
    { key: "crystal", label: t("水晶滑块") },
    { key: "capsule", label: t("胶囊徽标") },
  ];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("切换导航风格")}
        title={t("切换导航风格")}
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="18" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
          <rect x="3" y="14" width="8" height="6" rx="3" stroke="currentColor" strokeWidth="1.7" />
          <rect x="14" y="14" width="7" height="6" rx="3" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("导航风格")}
          className="absolute right-0 top-full z-50 mt-1.5 w-[168px] rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-pop)] rise"
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={style === option.key}
              onClick={() => {
                setStyle(option.key);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                style === option.key
                  ? "bg-accent-soft text-accent"
                  : "text-muted-foreground hover:bg-hover hover:text-foreground"
              }`}
            >
              <span aria-hidden="true" className="shrink-0">
                {option.key === "crystal" ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="14" rx="4" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="6" y="8" width="5" height="8" rx="2" fill="currentColor" opacity="0.45" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="6" width="20" height="12" rx="6" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="6" y="9" width="6" height="6" rx="2" fill="currentColor" opacity="0.45" />
                  </svg>
                )}
              </span>
              <span className="flex-1">{option.label}</span>
              {style === option.key && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
