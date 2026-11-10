"use client";

import { useMemo } from "react";

import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

interface MonthlyReturnGridProps {
  symbol: string;
  months: { key: string; year: number; month: number; value: number }[];
}

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

function cellBackground(value: number, scale: number): string {
  const strength = Math.min(1, Math.abs(value) / (scale || 1)) * 0.6;
  const base = value >= 0 ? "var(--positive)" : "var(--negative)";
  return `color-mix(in srgb, ${base} ${Math.round(8 + strength * 60)}%, transparent)`;
}

/** 月度收益表：看季节性与「大赚大亏都发生在哪几个月」 */
export default function MonthlyReturnGrid({ symbol, months }: MonthlyReturnGridProps) {
  const { t } = useI18n();

  const { years, table, scale, best, worst } = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of months) map.set(`${item.year}-${item.month}`, item.value);
    const list = [...new Set(months.map((item) => item.year))].sort((a, b) => b - a);
    let maxAbs = 0;
    for (const item of months) maxAbs = Math.max(maxAbs, Math.abs(item.value));
    const sorted = [...months].sort((a, b) => b.value - a.value);
    return {
      years: list,
      table: map,
      scale: maxAbs,
      best: sorted[0] ?? null,
      worst: sorted[sorted.length - 1] ?? null,
    };
  }, [months]);

  if (months.length === 0) {
    return <p className="px-4 py-6 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>;
  }

  return (
    <div className="p-3">
      <div className="overflow-auto scroll-thin">
        <table className="w-full min-w-[520px] text-[10.5px]">
          <thead>
            <tr className="text-[9.5px] text-muted-foreground">
              <th className="px-1.5 py-1 text-left font-medium">{symbol}</th>
              {MONTHS.map((month) => (
                <th key={month} className="px-1 py-1 text-center font-medium">
                  {month}
                </th>
              ))}
              <th className="px-1.5 py-1 text-right font-medium">{t("全年")}</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const values = MONTHS.map((_, index) => table.get(`${year}-${index + 1}`));
              let compounded: number | null = null;
              for (const value of values) {
                if (value === undefined) continue;
                compounded =
                  compounded === null ? value : ((1 + compounded / 100) * (1 + value / 100) - 1) * 100;
              }
              return (
                <tr key={year}>
                  <td className="num px-1.5 py-0.5 text-left text-muted-foreground">{year}</td>
                  {values.map((value, index) => (
                    <td key={index} className="px-0.5 py-0.5">
                      <div
                        className="num flex h-5 items-center justify-center rounded text-[9.5px] text-foreground/85"
                        style={{
                          background:
                            value === undefined ? "transparent" : cellBackground(value, scale),
                          color: value === undefined ? "var(--muted-foreground)" : undefined,
                        }}
                        title={value === undefined ? "" : `${value.toFixed(2)}%`}
                      >
                        {value === undefined ? "·" : value.toFixed(1)}
                      </div>
                    </td>
                  ))}
                  <td className="num px-1.5 py-0.5 text-right text-foreground/80">
                    {formatPercent(compounded, 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {t("月度涨跌幅（%）：找季节性，也看最大回撤集中在哪几个月。")}
        {best && worst && (
          <span>
            {" "}
            {t("最好")} {best.key} {formatPercent(best.value, 1)} · {t("最差")} {worst.key}{" "}
            {formatPercent(worst.value, 1)}
          </span>
        )}
      </p>
    </div>
  );
}
