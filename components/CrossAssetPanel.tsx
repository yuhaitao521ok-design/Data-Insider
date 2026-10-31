"use client";

import Sparkline from "@/components/Sparkline";
import { CROSS_ASSET_DEFINITIONS } from "@/lib/market-panels";
import { formatNumber, formatPercent } from "@/lib/format";
import type { Quote } from "@/lib/types";

interface CrossAssetPanelProps {
  quotes: Record<string, Quote>;
  loading: boolean;
}

/** 跨资产：VIX / 美债 10 年 / 美元指数 / 黄金 / 原油 / 比特币 */
export default function CrossAssetPanel({ quotes, loading }: CrossAssetPanelProps) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card"
      aria-label="跨资产行情"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[12px] font-medium">跨资产</h2>
        <span className="text-[9.5px] text-muted-foreground">风险偏好速览</span>
      </div>

      <div className="divide-y divide-border">
        {CROSS_ASSET_DEFINITIONS.map((definition) => {
          const quote = quotes[definition.symbol];
          const percent = quote?.changePercent ?? null;
          const up = (percent ?? 0) >= 0;
          const toneClass =
            percent === null
              ? "text-muted-foreground"
              : up
                ? "text-positive-text"
                : "text-negative-text";

          const value =
            quote === null || quote === undefined
              ? "--"
              : definition.unit === "yield"
                ? `${formatNumber(quote.price, 2)}%`
                : formatNumber(quote.price, quote.price >= 1000 ? 0 : 2);

          return (
            <div
              key={definition.symbol}
              className="flex items-center gap-2 px-3 py-1.5"
              title={`${definition.label}（${definition.symbol}）`}
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/85">
                {definition.label}
              </span>
              <Sparkline
                data={quote?.sparkline ?? []}
                positive={up}
                className="h-3.5 w-8 shrink-0 opacity-70"
              />
              <span className="num w-[58px] shrink-0 text-right text-[11.5px] text-foreground">
                {value}
              </span>
              <span className={`num w-[52px] shrink-0 text-right text-[10.5px] ${toneClass}`}>
                {quote ? formatPercent(percent) : loading ? "…" : "--"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
