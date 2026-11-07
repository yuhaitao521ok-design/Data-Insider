"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

const TABS = [
  { key: "market", href: "/", label: "行情" },
  { key: "earnings", href: "/earnings", label: "财报站" },
  { key: "research", href: "/research", label: "量化研究" },
  { key: "backtest", href: "/backtest", label: "回测" },
  { key: "institutions", href: "/institutions", label: "机构持仓" },
] as const;

interface Ripple {
  key: string;
  id: number;
}

/**
 * 移动端底部标签栏：水晶毛玻璃质感。
 * 按下 → 缩放 + 彩色光晕 + 水波纹；松开/导航后水波纹继续扩散，给出明确点击反馈。
 */
export default function MobileTabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [pressed, setPressed] = useState<string | null>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  const spawnRipple = useCallback((key: string) => {
    const id = (seq.current += 1);
    setRipples((prev) => [...prev.slice(-3), { key, id }]);
    window.setTimeout(() => {
      setRipples((prev) => prev.filter((item) => item.id !== id));
    }, 640);
  }, []);

  const release = useCallback(() => setPressed(null), []);

  return (
    <nav
      className="tab-glass fixed inset-x-0 bottom-0 z-40 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("移动端导航")}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1 px-2 pb-1 pt-1.5">
        {TABS.map((tab) => {
          const current = pathname === tab.href;
          const isPressed = pressed === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              data-tab={tab.key}
              aria-current={current ? "page" : undefined}
              onPointerDown={() => {
                setPressed(tab.key);
                spawnRipple(tab.key);
              }}
              onPointerUp={release}
              onPointerLeave={release}
              onPointerCancel={release}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  setPressed(tab.key);
                  spawnRipple(tab.key);
                }
              }}
              onKeyUp={release}
              className={`group relative flex flex-1 select-none flex-col items-center gap-1 overflow-hidden rounded-2xl px-1 pb-1.5 pt-2 text-[10.5px] transition-[transform,color,background-color] duration-200 ease-out active:scale-[0.93] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                current ? "text-accent" : "text-muted-foreground hover:text-foreground"
              } ${isPressed ? "scale-[0.93]" : "scale-100"}`}
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* 水晶光晕：选中常驻，按下时亮起 */}
              <span
                aria-hidden="true"
                className={`tab-glow pointer-events-none absolute inset-x-1 inset-y-0.5 rounded-2xl transition-opacity duration-300 ${
                  current || isPressed ? "opacity-100" : "opacity-0"
                }`}
              />

              {/* 按下 → 松开的水波纹（点击后继续扩散） */}
              {ripples
                .filter((item) => item.key === tab.key)
                .map((item) => (
                  <span
                    key={item.id}
                    aria-hidden="true"
                    className="tab-ripple pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-accent/40"
                  />
                ))}

              <span
                className={`relative transition-transform duration-200 ease-out ${
                  isPressed ? "scale-110" : current ? "scale-105" : "group-hover:scale-105"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  {tab.key === "market" && (
                    <path
                      d="M4 16.5 8.5 10l3.6 4.2L16.5 7.5H20"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {tab.key === "earnings" && (
                    <>
                      <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M9 9h6M9 13h6M9 17h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </>
                  )}
                  {tab.key === "research" && (
                    <>
                      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M8 15v-4M12 15V7M16 15v-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </>
                  )}
                  {tab.key === "backtest" && (
                    <>
                      <path d="M4 17l5-6 4 3 7-8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="9" cy="11" r="1.4" fill="currentColor" />
                    </>
                  )}
                  {tab.key === "institutions" && (
                    <>
                      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M3.5 19c0-2.8 2.5-4.5 5.5-4.5s5.5 1.7 5.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <path d="M16 6.5a2.8 2.8 0 0 1 0 5.4M17.5 18.8c0-2 .7-3.4 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </>
                  )}
                </svg>
              </span>
              <span className="relative leading-none">{t(tab.label)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
