"use client";

import type { ResearchRow } from "@/components/research/types";
import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

interface TrendAlignmentProps {
  rows: ResearchRow[];
  focusSymbol: string | null;
  onFocus: (symbol: string) => void;
}

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        on ? "bg-positive/80" : "bg-negative/50"
      }`}
    />
  );
}

/** 趋势结构：价格与两条均线、短长动量的方向一致性（共振分的明细） */
export default function TrendAlignment({ rows, focusSymbol, onFocus }: TrendAlignmentProps) {
  const { t } = useI18n();

  const sorted = [...rows].sort((a, b) => {
    if (b.trend.score !== a.trend.score) return b.trend.score - a.trend.score;
    return (b.metrics.momentum.d120 ?? -999) - (a.metrics.momentum.d120 ?? -999);
  });

  if (sorted.length === 0) {
    return <p className="px-4 py-6 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>;
  }

  return (
    <div className="overflow-auto scroll-thin">
      <table className="w-full min-w-[520px] text-[11px]">
        <thead>
          <tr className="border-b border-border text-[10px] text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">{t("代码")}</th>
            <th className="px-2 py-2 text-center font-medium">{t("价 > MA20")}</th>
            <th className="px-2 py-2 text-center font-medium">{t("价 > MA60")}</th>
            <th className="px-2 py-2 text-center font-medium">{t("1M > 0")}</th>
            <th className="px-2 py-2 text-center font-medium">{t("6M > 0")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("共振")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("距区间高点")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const active = focusSymbol === row.symbol;
            return (
              <tr
                key={row.symbol}
                onClick={() => onFocus(row.symbol)}
                className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-hover ${
                  active ? "bg-muted/60" : ""
                }`}
              >
                <td className="num px-3 py-1.5 text-left font-medium text-foreground/90">
                  {row.symbol}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <Dot on={row.trend.aboveMa20} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <Dot on={row.trend.aboveMa60} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <Dot on={row.trend.momentum1M} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <Dot on={row.trend.momentum6M} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`block h-full rounded-full ${
                          row.trend.score >= 3 ? "bg-positive/70" : "bg-negative/50"
                        }`}
                        style={{ width: `${(row.trend.score / 4) * 100}%` }}
                      />
                    </span>
                    <span className="num text-[10px] text-muted-foreground">
                      {row.trend.score}/4
                    </span>
                  </span>
                </td>
                <td className="num px-3 py-1.5 text-right text-muted-foreground">
                  {formatPercent(row.trend.fromHigh, 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
