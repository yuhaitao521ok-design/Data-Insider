"use client";

import { useMemo } from "react";

interface HeatRow {
  symbol: string;
  momentum: { d20: number | null; d60: number | null; d120: number | null };
}

interface MomentumHeatmapProps {
  rows: HeatRow[];
  labels: { symbol: string; m1: string; m3: string; m6: string };
}

type ColumnKey = "d20" | "d60" | "d120";

const COLUMNS: ColumnKey[] = ["d20", "d60", "d120"];

/** 动量热力图：行=标的、列=1M/3M/6M，发散色阶一眼看强弱 */
export default function MomentumHeatmap({ rows, labels }: MomentumHeatmapProps) {
  const scale = useMemo(() => {
    const values = rows.flatMap((row) =>
      COLUMNS.map((key) => Math.abs(row.momentum[key] ?? 0)),
    );
    return Math.max(1, ...values);
  }, [rows]);

  const cellStyle = (value: number | null) => {
    if (value === null) return { background: "transparent", color: "var(--muted-foreground)" };
    const strength = Math.min(1, Math.abs(value) / scale) * 0.72;
    const background =
      value >= 0
        ? `rgba(0, 191, 111, ${strength.toFixed(3)})`
        : `rgba(255, 45, 85, ${strength.toFixed(3)})`;
    return { background, color: "var(--foreground)" };
  };

  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[420px] text-[11px]">
        <thead>
          <tr className="text-[10px] text-muted-foreground">
            <th className="px-2.5 py-1.5 text-left font-medium">{labels.symbol}</th>
            <th className="px-2.5 py-1.5 text-right font-medium">{labels.m1}</th>
            <th className="px-2.5 py-1.5 text-right font-medium">{labels.m3}</th>
            <th className="px-2.5 py-1.5 text-right font-medium">{labels.m6}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol} className="border-t border-border/60">
              <td className="num px-2.5 py-1 text-left font-medium text-foreground/90">
                {row.symbol}
              </td>
              {COLUMNS.map((key) => {
                const value = row.momentum[key];
                return (
                  <td key={key} className="px-1.5 py-1">
                    <div
                      className="num rounded px-1.5 py-1 text-right transition-colors"
                      style={cellStyle(value)}
                    >
                      {value === null ? "--" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}