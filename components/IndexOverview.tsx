"use client";

import { INDEX_SYMBOLS, type Quote } from "@/lib/types";
import { formatPercent, formatPrice } from "@/lib/format";

interface IndexOverviewProps {
  quotes: Record<string, Quote>;
  loading?: boolean;
  selected: string;
  onSelect: (symbol: string) => void;
}

/**
 * 指数概览条：SPY / QQQ / DIA 三个 ETF 的报价。
 * 数据复用自选股的批量报价请求（见 Dashboard 的 loadQuotes），不额外发请求。
 */
export default function IndexOverview({
  quotes,
  loading = false,
  selected,
  onSelect,
}: IndexOverviewProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="指数概览">
      <span className="text-[11px] text-muted-foreground">指数概览</span>
      {INDEX_SYMBOLS.map((symbol) => {
        const item = quotes[symbol];
        const up = (item?.changePercent ?? 0) >= 0;
        return (
          <button
            key={symbol}
            type="button"
            onClick={() => onSelect(symbol)}
            aria-pressed={selected === symbol}
            className={`flex min-w-[132px] items-center gap-2 rounded-lg border bg-card px-2.5 py-1 text-left transition-colors hover:bg-hover ${
              selected === symbol ? "border-border-strong" : "border-border"
            }`}
            title={`查看 ${symbol} 行情`}
          >
            <span className="text-[11px] font-medium text-muted-foreground">{symbol}</span>
            <span className="num text-[12px] text-foreground">
              {item ? formatPrice(item.price, item.currency) : loading ? "…" : "--"}
            </span>
            <span
              className={`num ml-auto text-[11px] ${
                item?.changePercent === null || item?.changePercent === undefined
                  ? "text-muted-foreground"
                  : up
                    ? "text-positive-text"
                    : "text-negative-text"
              }`}
            >
              {formatPercent(item?.changePercent)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
