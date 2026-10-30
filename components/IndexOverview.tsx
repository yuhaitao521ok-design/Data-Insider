"use client";

import Sparkline from "@/components/Sparkline";
import SessionBadge from "@/components/SessionBadge";
import { INDEX_DEFINITIONS } from "@/lib/index-groups";
import { isExtendedSession } from "@/lib/session";
import { formatNumber, formatPercent, formatTimeInZone } from "@/lib/format";
import type { Quote } from "@/lib/types";

interface IndexOverviewProps {
  quotes: Record<string, Quote>;
  loading: boolean;
  error: string | null;
  /** 指数数据最后更新时间（ISO） */
  updatedAt: string | null;
  selected: string;
  onSelect: (symbol: string) => void;
  onRetry: () => void;
}

/**
 * 全球指数概览：美股（标普 / 纳指 / 道指 / 罗素 2000）+ 亚太（恒生 / 上证 / 沪深 300 / 日经 / KOSPI / STI）。
 * 数据来自 `/api/indices`（Yahoo spark 一次拿全部，30 秒刷新）。
 */
export default function IndexOverview({
  quotes,
  loading,
  error,
  updatedAt,
  selected,
  onSelect,
  onRetry,
}: IndexOverviewProps) {
  const updatedLabel = updatedAt
    ? formatTimeInZone(updatedAt, "Asia/Shanghai", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <section
      className="mb-4 overflow-hidden rounded-xl border border-border bg-card"
      aria-label="全球指数概览"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[12.5px] font-medium">全球指数</h2>
          <span className="text-[10px] text-muted-foreground">美股 · 亚太</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {error ? (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-border px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
            >
              重试
            </button>
          ) : (
            <span>{loading ? "更新中…" : "点击查看走势"}</span>
          )}
          {updatedLabel && <span className="num hidden sm:inline">更新 {updatedLabel}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5">
        {INDEX_DEFINITIONS.map((definition) => {
          const quote = quotes[definition.symbol];
          const percent = quote?.changePercent ?? null;
          const up = (percent ?? 0) >= 0;
          const toneClass =
            percent === null
              ? "text-muted-foreground"
              : up
                ? "text-positive-text"
                : "text-negative-text";
          const barColor =
            percent === null ? "var(--border-strong)" : up ? "var(--positive)" : "var(--negative)";
          const barWidth =
            percent === null ? 0 : Math.min(100, Math.max(6, Math.abs(percent) * 18));

          return (
            <button
              key={definition.symbol}
              type="button"
              onClick={() => onSelect(definition.symbol)}
              aria-pressed={selected === definition.symbol}
              title={`${definition.label}（${definition.symbol}）`}
              className={`group relative flex flex-col gap-1.5 px-3.5 py-2.5 text-left transition-colors hover:bg-hover ${
                selected === definition.symbol ? "bg-muted/60" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[11.5px] font-medium leading-4 text-foreground/90">
                  {definition.label}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {definition.region === "us" &&
                    quote?.session &&
                    isExtendedSession(quote.session) && (
                      <SessionBadge session={quote.session} size="xs" />
                    )}
                  <span className="num text-[9.5px] leading-4 text-muted-foreground">
                    {definition.short}
                  </span>
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <span className="num text-[15px] font-medium leading-5 tracking-tight text-foreground">
                  {quote ? formatNumber(quote.price, 2) : loading ? "…" : "--"}
                </span>
                <span className={`num text-[11px] leading-4 ${toneClass}`}>
                  {formatPercent(percent)}
                </span>
              </div>

              <Sparkline
                data={quote?.sparkline ?? []}
                positive={up}
                className="h-5 w-full opacity-80 transition-opacity group-hover:opacity-100"
              />

              <span className="absolute bottom-0 left-0 h-[2px] w-full bg-transparent">
                <span
                  className="block h-full rounded-r-full transition-all duration-500"
                  style={{ width: `${barWidth}%`, background: barColor }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
