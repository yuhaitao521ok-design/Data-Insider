"use client";

import { formatPercent } from "@/lib/format";
import type { Quote } from "@/lib/types";
import type { WatchlistSection } from "@/lib/watchlist";

interface GroupSummaryProps {
  sections: WatchlistSection[];
  quotes: Record<string, Quote>;
}

/** 左栏底部：每个分组的表现（只统计有报价的标的） */
export default function GroupSummary({ sections, quotes }: GroupSummaryProps) {
  const rows = sections
    .map((section) => {
      const items = section.symbols
        .map((symbol) => quotes[symbol])
        .filter((item): item is Quote => Boolean(item) && item.changePercent !== null);
      if (items.length === 0) return null;

      const up = items.filter((item) => (item.changePercent ?? 0) > 0).length;
      const down = items.filter((item) => (item.changePercent ?? 0) < 0).length;
      const average =
        items.reduce((sum, item) => sum + (item.changePercent ?? 0), 0) / items.length;

      return { id: section.id, name: section.name, total: items.length, up, down, average };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return null;

  return (
    <div className="border-t border-border px-3 py-2">
      <p className="mb-1 text-[10px] font-medium text-muted-foreground">分组表现</p>
      <div className="space-y-1">
        {rows.map((row) => {
          const up = row.average >= 0;
          const width = Math.min(100, Math.abs(row.average) * 22);
          return (
            <div key={row.id} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-[72px] shrink-0 truncate text-foreground/80">{row.name}</span>
              <span className="num w-[34px] shrink-0 text-right text-muted-foreground">
                {row.total} 只
              </span>
              <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${width}%`,
                    background: up ? "var(--positive)" : "var(--negative)",
                  }}
                />
              </span>
              <span
                className={`num w-[52px] shrink-0 text-right ${
                  up ? "text-positive-text" : "text-negative-text"
                }`}
              >
                {formatPercent(row.average)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
