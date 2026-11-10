"use client";

import { useMemo, useState } from "react";

import SymbolPool from "@/components/research/SymbolPool";
import type { ResearchRow } from "@/components/research/types";
import { formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  averageCorrelation,
  correlationByTime,
  pairwiseCorrelations,
  seriateCorrelation,
} from "@/lib/quant";

interface CorrelationMatrixProps {
  /** 标的池（含尚未加载完成的） */
  symbols: string[];
  rows: ResearchRow[];
  loading: boolean;
  pending: string[];
  rangeLabel: string;
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
  onReset: () => void;
  onClear: () => void;
}

function cellColor(value: number | null): string {
  if (value === null) return "var(--muted)";
  const magnitude = Math.min(1, Math.abs(value));
  const base = value >= 0 ? "var(--positive)" : "var(--negative)";
  return `color-mix(in srgb, ${base} ${Math.round(16 + magnitude * 68)}%, transparent)`;
}

type Pair = { a: string; b: string; value: number | null; samples: number };

/** 相关性矩阵：标的自由增删、按相关聚类排序、可导出 CSV */
export default function CorrelationMatrix({
  symbols,
  rows,
  loading,
  pending,
  rangeLabel,
  onAdd,
  onRemove,
  onReset,
  onClear,
}: CorrelationMatrixProps) {
  const { t } = useI18n();
  const [orderBy, setOrderBy] = useState<"cluster" | "symbol">("cluster");

  const matrix = useMemo(
    () =>
      rows.map((rowA) =>
        rows.map((rowB) =>
          rowA.symbol === rowB.symbol ? 1 : correlationByTime(rowA.timed, rowB.timed),
        ),
      ),
    [rows],
  );

  const indexOrder = useMemo(() => {
    if (orderBy === "symbol") return rows.map((_, index) => index);
    return seriateCorrelation(matrix);
  }, [orderBy, rows, matrix]);

  const stats = useMemo(() => {
    const series = rows.map((row) => ({ symbol: row.symbol, returns: row.timed }));
    const pairs = pairwiseCorrelations(series).filter(
      (pair): pair is Pair & { value: number } => pair.value !== null,
    );
    if (pairs.length === 0) {
      return { average: null as number | null, best: null as Pair | null, worst: null as Pair | null };
    }
    const sorted = [...pairs].sort((a, b) => b.value - a.value);
    return {
      average: averageCorrelation(series),
      best: sorted[0] as Pair,
      worst: sorted[sorted.length - 1] as Pair,
    };
  }, [rows]);

  const diversity = stats.average === null ? null : Math.max(0, 1 - stats.average) * 100;

  function exportCsv() {
    const ordered = indexOrder.map((index) => rows[index]);
    const position = new Map(rows.map((row, index) => [row.symbol, index]));
    const lines = [["symbol", ...ordered.map((row) => row.symbol)].join(",")];
    for (const rowA of ordered) {
      const indexA = position.get(rowA.symbol) ?? 0;
      const values = ordered.map((rowB) => {
        if (rowA.symbol === rowB.symbol) return "1";
        const value = matrix[indexA]?.[position.get(rowB.symbol) ?? 0];
        return value === null || value === undefined ? "" : value.toFixed(3);
      });
      lines.push([rowA.symbol, ...values].join(","));
    }
    const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `correlation-${rangeLabel}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section id="correlation" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-medium">{t("相关性矩阵")}</h2>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            {t("日收益 · 按共同交易日对齐 · 标的可自由增删（无数量上限）")} · {rangeLabel}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {(
              [
                { key: "cluster", label: t("按相关聚类") },
                { key: "symbol", label: t("按代码") },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setOrderBy(item.key)}
                aria-pressed={orderBy === item.key}
                className={`h-6 rounded-md px-2 text-[10.5px] transition-colors ${
                  orderBy === item.key
                    ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="h-7 rounded-md border border-border px-2 text-[10.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-40"
          >
            {t("导出 CSV")}
          </button>
        </div>
      </div>

      <div className="border-b border-border px-4 py-2.5">
        <SymbolPool
          compact
          symbols={symbols}
          onAdd={onAdd}
          onRemove={onRemove}
          onReset={onReset}
          onClear={onClear}
          pending={pending}
        />
      </div>

      {rows.length < 2 ? (
        <p className="px-4 py-6 text-[11.5px] text-muted-foreground">
          {loading ? t("计算中…") : t("至少需要 2 只已加载的标的才能计算相关性")}
        </p>
      ) : (
        <MatrixBody
          rows={rows}
          matrix={matrix}
          indexOrder={indexOrder}
          stats={stats}
          diversity={diversity}
          onRemove={onRemove}
        />
      )}
    </section>
  );
}

function MatrixBody({
  rows,
  matrix,
  indexOrder,
  stats,
  diversity,
  onRemove,
}: {
  rows: ResearchRow[];
  matrix: (number | null)[][];
  indexOrder: number[];
  stats: { average: number | null; best: Pair | null; worst: Pair | null };
  diversity: number | null;
  onRemove: (symbol: string) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border px-4 py-2 text-[10.5px] text-muted-foreground">
        <span>
          {t("平均相关性")}{" "}
          <b
            className={`num ${
              stats.average !== null && stats.average > 0.7 ? "text-negative-text" : "text-foreground"
            }`}
          >
            {stats.average === null ? "--" : formatNumber(stats.average, 2)}
          </b>
        </span>
        <span>
          {t("分散度")}{" "}
          <b className="num text-foreground">
            {diversity === null ? "--" : `${formatNumber(diversity, 0)}%`}
          </b>
        </span>
        {stats.best && (
          <span>
            {t("最高相关")}{" "}
            <b className="num text-foreground">
              {stats.best.a}/{stats.best.b} {formatNumber(stats.best.value, 2)}
            </b>
          </span>
        )}
        {stats.worst && (
          <span>
            {t("最低相关")}{" "}
            <b className="num text-foreground">
              {stats.worst.a}/{stats.worst.b} {formatNumber(stats.worst.value, 2)}
            </b>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-1">
          <span>-1</span>
          <span
            className="h-2 w-24 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--negative) 65%, transparent), transparent, color-mix(in srgb, var(--positive) 65%, transparent))",
            }}
          />
          <span>+1</span>
        </span>
      </div>

      <div className="max-h-[70vh] overflow-auto scroll-thin">
        <table className="border-separate border-spacing-0 text-[10px]">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
                {t("代码")}
              </th>
              {indexOrder.map((index) => (
                <th
                  key={`head-${rows[index].symbol}`}
                  className="sticky top-0 z-20 bg-card px-1 py-1.5 text-center font-medium text-muted-foreground"
                >
                  <span className="inline-block max-w-[64px] truncate" title={rows[index].symbol}>
                    {rows[index].symbol}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indexOrder.map((indexA) => (
              <tr key={`row-${rows[indexA].symbol}`}>
                <td className="sticky left-0 z-10 bg-card px-2 py-1 text-left">
                  <span className="inline-flex items-center gap-1">
                    <span className="num max-w-[64px] truncate font-medium text-foreground/90">
                      {rows[indexA].symbol}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(rows[indexA].symbol)}
                      aria-label={`${t("移除")} ${rows[indexA].symbol}`}
                      title={t("从标的池移除")}
                      className="grid h-3.5 w-3.5 place-items-center rounded text-muted-foreground/60 transition-colors hover:bg-hover hover:text-negative-text"
                    >
                      <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden>
                        <path
                          d="M1 1l8 8M9 1L1 9"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </span>
                </td>
                {indexOrder.map((indexB) => {
                  const value = matrix[indexA]?.[indexB] ?? null;
                  const same = indexA === indexB;
                  return (
                    <td key={`cell-${rows[indexA].symbol}-${rows[indexB].symbol}`} className="p-0.5">
                      <div
                        className={`num flex h-5 min-w-[38px] items-center justify-center rounded ${
                          same ? "font-medium text-foreground/70" : "text-foreground/85"
                        }`}
                        style={{ background: same ? "var(--muted)" : cellColor(value) }}
                        title={`${rows[indexA].symbol} / ${rows[indexB].symbol}：${
                          value === null ? "--" : value.toFixed(3)
                        }`}
                      >
                        {value === null ? "--" : value.toFixed(2)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        {t("绿=同涨同跌，红=反向；平均相关性越低、分散度越高。相关性会随行情变化，建议切换区间对比。")}
      </p>
    </>
  );
}

