"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";

const TABS = ["market", "watchlist", "panorama"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  market: "行情",
  watchlist: "自选股",
  panorama: "全景",
};

/** 滚动目标：行情直接定位到图表区 */
const TAB_TARGET: Record<(typeof TABS)[number], string> = {
  market: "chart",
  watchlist: "watchlist",
  panorama: "panorama",
};

/** 移动端底部标签栏：三个锚点（行情 / 自选股 / 市场全景） */
export default function MobileTabBar() {
  const { t } = useI18n();
  const [active, setActive] = useState<(typeof TABS)[number]>("market");

  function go(id: (typeof TABS)[number]) {
    setActive(id);
    document.getElementById(TAB_TARGET[id])?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("移动端导航")}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {TABS.map((tab) => {
          const current = active === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => go(tab)}
              aria-current={current ? "page" : undefined}
              data-tab={tab}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10.5px] transition-colors ${
                current ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                {tab === "market" && (
                  <path
                    d="M4 16.5 8.5 10l3.6 4.2L16.5 7.5H20"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {tab === "watchlist" && (
                  <>
                    <path
                      d="M6 4h12v16l-6-3.6L6 20V4Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </>
                )}
                {tab === "panorama" && (
                  <>
                    <rect x="4" y="4" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="13" y="4" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="4" y="13" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="13" y="13" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
                  </>
                )}
              </svg>
              {t(TAB_LABEL[tab])}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
