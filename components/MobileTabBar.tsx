"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

const TABS = [
  { key: "market", href: "/", label: "行情" },
  { key: "earnings", href: "/earnings", label: "财报站" },
  { key: "research", href: "/research", label: "量化研究" },
  { key: "backtest", href: "/backtest", label: "回测" },
  { key: "institutions", href: "/institutions", label: "机构持仓" },
] as const;

/** 移动端底部标签栏：五个功能页 */
export default function MobileTabBar() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label={t("移动端导航")}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {TABS.map((tab) => {
          const current = pathname === tab.href;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              data-tab={tab.key}
              aria-current={current ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10.5px] transition-colors ${
                current ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
              {t(tab.label)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
