"use client";

import { SECTOR_DEFINITIONS } from "@/lib/market-panels";
import { formatPercent } from "@/lib/format";
import type { Quote } from "@/lib/types";

interface SectorHeatmapProps {
  quotes: Record<string, Quote>;
  loading: boolean;
  selected: string;
  onSelect: (symbol: string) => void;
}

/** 板块热力图：11 个 SPDR 行业 ETF，按涨跌幅给底色，点击切换查看走势 */
export default function SectorHeatmap({
  quotes,
  loading,
  selected,
  onSelect,
}: SectorHeatmapProps) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-card"
      aria-label="板块热力图"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[12px] font-medium">板块热力</h2>
        <span className="text-[9.5px] text-muted-foreground">SPDR 行业 ETF · 点击看走势</span>
      </div>

      <div className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3 xl:grid-cols-2">
        {SECTOR_DEFINITIONS.map((definition) => {
          const quote = quotes[definition.symbol];
          const percent = quote?.changePercent ?? null;
          const intensity = percent === null ? 0 : Math.min(1, Math.abs(percent) / 3);
          const tone = percent === null ? "var(--muted)" : percent >= 0 ? "var(--positive)" : "var(--negative)";
          const alpha = percent === null ? 0 : 0.1 + intensity * 0.4;
          const toneClass =
            percent === null
              ? "text-muted-foreground"
              : percent >= 0
                ? "text-positive-text"
                : "text-negative-text";

          return (
            <button
              key={definition.symbol}
              type="button"
              onClick={() => onSelect(definition.symbol)}
              aria-pressed={selected === definition.symbol}
              title={`${definition.label}（${definition.symbol}）${quote ? ` · ${quote.price}` : ""}`}
              className={`flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-transform hover:scale-[1.02] ${
                selected === definition.symbol ? "border-border-strong" : "border-transparent"
              }`}
              style={{
                backgroundColor:
                  percent === null
                    ? "var(--muted)"
                    : `color-mix(in srgb, ${tone} ${Math.round(alpha * 100)}%, transparent)`,
              }}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="truncate text-[11px] font-medium text-foreground/90">
                  {definition.label}
                </span>
                <span className="num shrink-0 text-[9px] text-muted-foreground">
                  {definition.short}
                </span>
              </span>
              <span className={`num text-[12px] leading-4 ${toneClass}`}>
                {quote ? formatPercent(percent) : loading ? "…" : "--"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
