"use client";

import type { Fundamentals } from "@/lib/types";
import { formatCompact, formatNumber, formatPercent, formatPrice } from "@/lib/format";

interface FundamentalsCardProps {
  symbol: string;
  price: number | null;
  currency: string;
  data: Fundamentals | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const SOURCE_LABEL: Record<Fundamentals["source"], string> = {
  yahoo: "Yahoo Finance",
  nasdaq: "Nasdaq",
};

/** 基本面卡片：市值 / 估值 / 分红 / 52 周区间位置 */
export default function FundamentalsCard({
  symbol,
  price,
  currency,
  data,
  loading,
  error,
  onRetry,
}: FundamentalsCardProps) {
  const metrics: { label: string; value: string; title?: string }[] = [
    {
      label: "总市值",
      value: data?.marketCap != null ? `$${formatCompact(data.marketCap)}` : "--",
      title: data?.marketCap != null ? formatPrice(data.marketCap, currency) : undefined,
    },
    {
      label: "市盈率 TTM",
      value: formatNumber(data?.peRatio, 2),
      title: "Trailing P/E",
    },
    {
      label: "预期市盈率",
      value: formatNumber(data?.forwardPe, 2),
      title: "Forward P/E",
    },
    {
      label: "每股收益 TTM",
      value: data?.eps != null ? `${formatPrice(data.eps, currency)}${data.epsDerived ? " *" : ""}` : "--",
      title: data?.epsDerived ? "Trailing EPS（由现价 ÷ 市盈率推算）" : "Trailing EPS",
    },
    {
      label: "股息率",
      value:
        data?.dividendYield != null ? formatPercent(data.dividendYield, 2) : "--",
      title: "Annual dividend yield",
    },
    { label: "Beta", value: formatNumber(data?.beta, 2) },
    {
      label: "平均成交量",
      value: data?.averageVolume != null ? formatCompact(data.averageVolume) : "--",
    },
    {
      label: "1 年目标价",
      value: data?.oneYearTarget != null ? formatPrice(data.oneYearTarget, currency) : "--",
      title: "Analyst 1y target mean",
    },
  ];

  const low = data?.week52Low ?? null;
  const high = data?.week52High ?? null;
  const hasRange = low !== null && high !== null && high > low;
  const position =
    hasRange && price !== null ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : null;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium">基本面</h3>
          <span className="text-[11px] text-muted-foreground">{symbol}</span>
          {data && (
            <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground">
              {SOURCE_LABEL[data.source]}
            </span>
          )}
          {loading && <span className="text-[10.5px] text-muted-foreground">加载中…</span>}
        </div>
        <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
          {data?.sector && (
            <span className="truncate" title={data.industry ?? undefined}>
              {data.sector}
              {data.industry ? ` · ${data.industry}` : ""}
            </span>
          )}
          {error && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded border border-border px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
            >
              重试
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="px-4 py-3 text-[11px] leading-4 text-muted-foreground">
          基本面加载失败：{error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="bg-card px-4 py-2.5" title={metric.title}>
                <p className="text-[10.5px] text-muted-foreground">{metric.label}</p>
                <p className="num mt-0.5 truncate text-[12.5px] text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>

          {hasRange && (
            <div className="border-t border-border px-4 py-2.5">
              <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                <span className="num">52 周低 {formatPrice(low, currency)}</span>
                {position !== null && (
                  <span className="num">
                    现价距高{" "}
                    {high ? formatPercent(((high - (price ?? high)) / high) * 100, 2) : "--"}
                  </span>
                )}
                <span className="num">52 周高 {formatPrice(high, currency)}</span>
              </div>
              <div className="relative mt-1.5 h-1.5 rounded-full bg-muted">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-accent/35"
                  style={{ width: `${position ?? 0}%` }}
                />
                {position !== null && (
                  <span
                    className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
                    style={{ left: `${position}%` }}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}
