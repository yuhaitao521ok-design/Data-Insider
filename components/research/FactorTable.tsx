"use client";

import { formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { ResearchRow, ResearchSortKey } from "@/components/research/types";

interface FactorTableProps {
  rows: ResearchRow[];
  sortKey: ResearchSortKey;
  sortDesc: boolean;
  onSort: (key: ResearchSortKey) => void;
  onFocus: (symbol: string) => void;
  onExplain: (id: string) => void;
  onRemove: (symbol: string) => void;
  focusSymbol: string | null;
  loading: boolean;
}

function tone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  return value >= 0 ? "text-positive-text" : "text-negative-text";
}

function scoreTone(score: number): string {
  if (score >= 3) return "bg-positive/15 text-positive-text";
  if (score === 2) return "bg-muted text-muted-foreground";
  return "bg-negative/10 text-negative-text";
}

/** 因子表：一行一只标的，所有指标都能点表头排序、点行看单只细节 */
export default function FactorTable({
  rows,
  sortKey,
  sortDesc,
  onSort,
  onFocus,
  onExplain,
  onRemove,
  focusSymbol,
  loading,
}: FactorTableProps) {
  const { t } = useI18n();

  const headerCell = (
    key: ResearchSortKey,
    label: string,
    explainId: string,
    align: "left" | "right" = "right",
  ) => (
    <th
      className={`whitespace-nowrap px-2.5 py-2 font-medium ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "left" ? "" : "justify-end"}`}>
        <button
          type="button"
          onClick={() => onSort(key)}
          className={`transition-colors hover:text-foreground ${
            sortKey === key ? "text-foreground" : ""
          }`}
        >
          {label}
          {sortKey === key && <span className="ml-0.5 text-[8px]">{sortDesc ? "▼" : "▲"}</span>}
        </button>
        <button
          type="button"
          onClick={() => onExplain(explainId)}
          title={`${t("因子说明")}：${label}`}
          aria-label={`${t("因子说明")}：${label}`}
          className="grid h-3.5 w-3.5 place-items-center rounded-full border border-border text-[8px] text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          i
        </button>
      </span>
    </th>
  );

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="skeleton h-7 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-[12px] text-muted-foreground">{t("暂无数据")}</p>;
  }

  return (
    <div className="overflow-auto scroll-thin">
      <table className="w-full min-w-[1180px] text-[11.5px]">
        <thead>
          <tr className="border-b border-border text-[10px] text-muted-foreground">
            {headerCell("symbol", t("代码"), "symbol", "left")}
            {headerCell("resonance", t("共振"), "resonance")}
            {headerCell("d20", t("动量 1M"), "momentum1M")}
            {headerCell("d60", t("动量 3M"), "momentum3M")}
            {headerCell("d120", t("动量 6M"), "momentum6M")}
            {headerCell("vol", t("年化波动"), "volatility")}
            {headerCell("sharpe", t("夏普"), "sharpe")}
            {headerCell("sortino", t("索提诺"), "sortino")}
            {headerCell("dd", t("最大回撤"), "maxDrawdown")}
            {headerCell("ddDays", t("回撤天"), "drawdownDays")}
            {headerCell("win", t("胜率"), "winRate")}
            {headerCell("beta", t("Beta"), "beta")}
            {headerCell("alpha", t("年化 Alpha"), "alpha")}
            {headerCell("total", t("区间收益"), "totalReturn")}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.symbol}
              onClick={() => onFocus(row.symbol)}
              className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-hover ${
                focusSymbol === row.symbol ? "bg-muted/60" : ""
              }`}
            >
              <td className="px-2.5 py-1.5 text-left">
                <span className="inline-flex items-center gap-1">
                  <span className="num font-medium text-foreground">{row.symbol}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(row.symbol);
                    }}
                    aria-label={`${t("移除")} ${row.symbol}`}
                    title={t("从标的池移除")}
                    className="grid h-4 w-4 place-items-center rounded text-muted-foreground/70 transition-colors hover:bg-hover hover:text-negative-text"
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" aria-hidden>
                      <path
                        d="M1 1l8 8M9 1L1 9"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
              </td>
              <td className="px-2.5 py-1.5 text-right">
                <span
                  className={`num inline-flex h-4 min-w-[30px] items-center justify-center rounded px-1 text-[10px] ${scoreTone(
                    row.trend.score,
                  )}`}
                  title={t("共振分越高，短中长期方向越一致")}
                >
                  {row.trend.score}/4
                </span>
              </td>
              <td className={`num px-2.5 py-1.5 text-right ${tone(row.metrics.momentum.d20)}`}>
                {formatPercent(row.metrics.momentum.d20)}
              </td>
              <td className={`num px-2.5 py-1.5 text-right ${tone(row.metrics.momentum.d60)}`}>
                {formatPercent(row.metrics.momentum.d60)}
              </td>
              <td className={`num px-2.5 py-1.5 text-right ${tone(row.metrics.momentum.d120)}`}>
                {formatPercent(row.metrics.momentum.d120)}
              </td>
              <td className="num px-2.5 py-1.5 text-right">
                {formatPercent(row.metrics.volatility, 1).replace("+", "")}
              </td>
              <td className={`num px-2.5 py-1.5 text-right ${tone(row.metrics.sharpe)}`}>
                {formatNumber(row.metrics.sharpe, 2)}
              </td>
              <td className={`num px-2.5 py-1.5 text-right ${tone(row.metrics.sortino)}`}>
                {formatNumber(row.metrics.sortino, 2)}
              </td>
              <td className="num px-2.5 py-1.5 text-right text-negative-text">
                {formatPercent(row.metrics.maxDrawdown, 2)}
              </td>
              <td className="num px-2.5 py-1.5 text-right text-muted-foreground">
                {row.metrics.drawdown.longestDays === null
                  ? "--"
                  : `${row.metrics.drawdown.longestDays}d`}
              </td>
              <td className="num px-2.5 py-1.5 text-right text-muted-foreground">
                {formatPercent(row.metrics.winRate, 1).replace("+", "")}
              </td>
              <td className="num px-2.5 py-1.5 text-right">{formatNumber(row.alphaBeta.beta, 2)}</td>
              <td className={`num px-2.5 py-1.5 text-right ${tone(row.alphaBeta.alphaAnnualized)}`}>
                {formatPercent(row.alphaBeta.alphaAnnualized)}
              </td>
              <td className={`num px-2.5 py-1.5 text-right ${tone(row.metrics.totalReturn)}`}>
                {formatPercent(row.metrics.totalReturn)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
