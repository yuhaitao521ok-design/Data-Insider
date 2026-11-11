"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SearchBox from "@/components/SearchBox";
import ThemeToggle from "@/components/ThemeToggle";
import NavStyleSwitcher from "@/components/NavStyleSwitcher";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { useI18n } from "@/lib/i18n";
import { scrollToSectionWithRetry } from "@/lib/scroll";

interface SiteHeaderProps {
  /** 页面内选中标的（首页用；其它页面会跳到 /?symbol=xxx） */
  onPickSymbol?: (symbol: string) => void;
}

const MARKET_ITEMS = [
  { key: "chart", label: "个股行情", hint: "走势图与关键指标" },
  { key: "indices", label: "全球指数", hint: "美股 · 亚太" },
  { key: "watchlist", label: "自选股", hint: "分组与快速添加" },
  { key: "panorama", label: "市场全景", hint: "跨资产与板块热力" },
];

const PAGES = [
  { key: "earnings", href: "/earnings", label: "财报站" },
  { key: "research", href: "/research", label: "量化研究" },
  { key: "backtest", href: "/backtest", label: "回测" },
  { key: "institutions", href: "/institutions", label: "机构持仓" },
];

/** 全站顶部导航（首页与各功能页共用） */
export default function SiteHeader({ onPickSymbol }: SiteHeaderProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [navMenu, setNavMenu] = useState<string | null>(null);

  const isDashboard = pathname === "/";

  useEffect(() => {
    setNavMenu(null);
  }, [pathname]);

  function pickSymbol(symbol: string) {
    if (onPickSymbol) {
      onPickSymbol(symbol);
      return;
    }
    router.push(`/?symbol=${encodeURIComponent(symbol)}`);
  }

  function goAnchor(id: string) {
    setNavMenu(null);
    if (!isDashboard) {
      router.push(`/#${id}`);
      return;
    }
    scrollToSectionWithRetry(id);
  }

  const navItemClass =
    "group relative flex items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:px-6 xl:max-w-[1640px] 2xl:max-w-[2200px]">
        <Link
          href="/"
          aria-label={`TideWhale ${t("潮鲸")}`}
          title={`TideWhale ${t("潮鲸")}`}
          className="flex shrink-0 items-center gap-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M2.2 20.2c1.9 0 2.8-1.1 4.7-1.1s2.8 1.1 4.7 1.1 2.8-1.1 4.7-1.1 2.8 1.1 4.7 1.1"
                stroke="var(--accent)"
                strokeOpacity="0.35"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M2.8 18.2c2.1 0 3.2-1.2 5.3-1.2s3.2 1.2 5.3 1.2 3.2-1.2 5.3-1.2 3.2 1.2 5.3 1.2"
                stroke="var(--accent)"
                strokeOpacity="0.8"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3 12.9c0-2.8 2.9-5 6.7-5 3.3 0 5.8 1.7 7.2 3.9 1.3-.4 2.6-1.4 3.7-2.7.3-.4.9-.1.8.4l-.4 2.6 1.3-.6c.4-.2.9.2.7.6l-1.1 3.4c-.1.4-.5.5-.9.3l-1.6-.9c-1.7 2.1-4.4 3.4-7.7 3.4-4.4 0-7.7-2.1-7.7-5.4Z"
                fill="currentColor"
              />
              <circle cx="8.2" cy="11" r="0.8" fill="var(--card)" />
              <path
                d="M7.4 7.3c-.5-.9-.6-1.9-.3-2.9"
                stroke="currentColor"
                strokeOpacity="0.55"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <circle cx="6.6" cy="3.9" r="0.55" fill="currentColor" fillOpacity="0.55" />
            </svg>
          </span>
          <span className="text-[15px] font-medium tracking-tight">TideWhale</span>
          <span className="hidden text-[12px] font-medium text-muted-foreground sm:inline">{t("潮鲸")}</span>
        </Link>

        <nav
          className="ml-3 hidden items-stretch gap-1 self-stretch lg:flex"
          aria-label={t("页面导航")}
        >
          <div
            className="relative flex items-stretch"
            onMouseEnter={() => setNavMenu("market")}
            onMouseLeave={() => setNavMenu((prev) => (prev === "market" ? null : prev))}
          >
            <Link
              href="/"
              aria-haspopup="menu"
              aria-expanded={navMenu === "market"}
              className={`${navItemClass} ${navMenu === "market" ? "bg-muted text-foreground" : ""}`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="text-muted-foreground/80 transition-colors group-hover:text-foreground"
              >
                <path
                  d="M4 16.5 8.5 10l3.6 4.2L16.5 7.5H20"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("行情")}
              <span
                className={`pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent transition-transform duration-200 ${
                  isDashboard ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                }`}
              />
            </Link>

            {navMenu === "market" && (
              <div role="menu" className="absolute left-0 top-full z-50 w-[230px] pt-1">
                <div className="rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-pop)] rise">
                  {MARKET_ITEMS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitem"
                      onClick={() => goAnchor(item.key)}
                      className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-hover"
                    >
                      <span className="text-[13px] font-medium text-foreground">
                        {t(item.label)}
                      </span>
                      <span className="text-[10.5px] leading-4 text-muted-foreground">
                        {t(item.hint)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {PAGES.map((page) => {
            const active = pathname === page.href;
            return (
              <Link
                key={page.key}
                href={page.href}
                aria-current={active ? "page" : undefined}
                className={`${navItemClass} ${active ? "bg-muted text-foreground" : ""}`}
              >
                {t(page.label)}
                <span
                  className={`pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent transition-transform duration-200 ${
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="order-4 w-full sm:order-none sm:ml-auto sm:w-[240px]">
          <SearchBox onPick={pickSymbol} />
        </div>

        <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
          <LocaleSwitcher />
          <NavStyleSwitcher />
          <ThemeToggle />

          <a
            href="https://github.com/yuhaitao521ok-design/TideWhale"
            target="_blank"
            rel="noreferrer noopener"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            aria-label={t("GitHub 仓库")}
            title={t("GitHub 仓库")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
