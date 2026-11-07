"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import MomentumHeatmap from "@/components/research/MomentumHeatmap";
import { useI18n } from "@/lib/i18n";
import { formatNumber, formatPercent } from "@/lib/format";
import {
  alphaBeta,
  correlation,
  dailyReturns,
  returnHistogram,
  riskMetrics,
  timedReturns,
} from "@/lib/quant";
import { DEFAULT_WATCHLIST, RANGE_CONFIG, type RangeKey } from "@/lib/types";

const WATCHLIST_KEY = "data-insider:watchlist:v1";
const RANGES: RangeKey[] = ["3M", "6M", "1Y", "5Y"];

interface Series {
  symbol: string;
  points: { t: number; close: number }[];
}

type SortKey = "symbol" | "d20" | "d60" | "d120" | "vol" | "sharpe" | "dd" | "win" | "beta" | "alpha";

export default function ResearchDashboard() {
  const { t } = useI18n();
  const [symbols, setSymbols] = useState<string[]>([...DEFAULT_WATCHLIST]);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("d20");
  const [sortDesc, setSortDesc] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WATCHLIST_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cleaned = parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, 12);
        if (cleaned.length > 0) setSymbols(cleaned);
      }
    } catch {
      // 忽略
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 顺带拉取 SPY 作为基准（已包含时不重复），用于 alpha / beta
      const requestSymbols = symbols.includes("SPY") ? symbols : [...symbols, "SPY"];
      const response = await fetch(
        `/api/batch-chart?symbols=${encodeURIComponent(requestSymbols.join(","))}&range=${range}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`加载失败（${response.status}）`);
      const data = (await response.json()) as { series: Series[] };
      setSeries(data.series ?? []);
    } catch (err) {
      setSeries([]);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [symbols, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const toPoints = (item: Series) =>
      item.points.map((point) => ({
        t: point.t,
        open: point.close,
        high: point.close,
        low: point.close,
        close: point.close,
        volume: null,
      }));
    const bench = series.find((item) => item.symbol === "SPY");
    const benchReturns = bench ? timedReturns(toPoints(bench)) : [];
    return series
      // SPY 只作基准；除非它本身就在自选里
      .filter((item) => item.symbol !== "SPY" || symbols.includes("SPY"))
      .map((item) => {
        const points = toPoints(item);
        const metrics = riskMetrics(points);
        const ab = benchReturns.length > 0 ? alphaBeta(timedReturns(points), benchReturns) : null;
        return {
          symbol: item.symbol,
          metrics,
          returns: dailyReturns(points),
          points,
          alphaBeta: ab,
        };
      });
  }, [series, symbols]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    const value = (key: SortKey, row: (typeof rows)[number]): number | string => {
      switch (key) {
        case "symbol":
          return row.symbol;
        case "d20":
          return row.metrics.momentum.d20 ?? Number.NEGATIVE_INFINITY;
        case "d60":
          return row.metrics.momentum.d60 ?? Number.NEGATIVE_INFINITY;
        case "d120":
          return row.metrics.momentum.d120 ?? Number.NEGATIVE_INFINITY;
        case "vol":
          return row.metrics.volatility ?? Number.NEGATIVE_INFINITY;
        case "sharpe":
          return row.metrics.sharpe ?? Number.NEGATIVE_INFINITY;
        case "dd":
          return row.metrics.maxDrawdown ?? Number.NEGATIVE_INFINITY;
        case "win":
          return row.metrics.winRate ?? Number.NEGATIVE_INFINITY;
        case "beta":
          return row.alphaBeta?.beta ?? Number.NEGATIVE_INFINITY;
        case "alpha":
          return row.alphaBeta?.alphaAnnualized ?? Number.NEGATIVE_INFINITY;
      }
    };

    copy.sort((a, b) => {
      const left = value(sortKey, a);
      const right = value(sortKey, b);
      if (typeof left === "string" || typeof right === "string") {
        return sortDesc
          ? String(right).localeCompare(String(left))
          : String(left).localeCompare(String(right));
      }
      return sortDesc ? right - left : left - right;
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  const matrix = useMemo(() => {
    const symbolsInMatrix = rows.slice(0, 10);
    return symbolsInMatrix.map((rowA) =>
      symbolsInMatrix.map((rowB) =>
        rowA.symbol === rowB.symbol
          ? 1
          : correlation(rowA.returns, rowB.returns),
      ),
    );
  }, [rows]);

  const focusRow = focus ? rows.find((row) => row.symbol === focus) ?? null : rows[0] ?? null;
  const histogram = focusRow ? returnHistogram(focusRow.returns) : [];
  const maxBin = histogram.length > 0 ? Math.max(...histogram.map((bin) => bin.count)) : 1;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((prev) => !prev);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  const headerCell = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <th
      className={`whitespace-nowrap px-2.5 py-2 font-medium ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-0.5 transition-colors hover:text-foreground ${
          sortKey === key ? "text-foreground" : ""
        }`}
      >
        {label}
        {sortKey === key && <span className="text-[8px]">{sortDesc ? "▼" : "▲"}</span>}
      </button>
    </th>
  );

  return (
    <PageShell
      title={t("量化研究")}
      description={t("因子表 · 相关性 · 风险统计（本地计算，不新增请求）")}
      actions={
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {RANGES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRange(item)}
                aria-pressed={range === item}
                className={`h-7 rounded-md px-2 text-[11.5px] transition-colors ${
                  range === item
                    ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(RANGE_CONFIG[item].label)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="h-7 rounded-md border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
          >
            {t("刷新")}
          </button>
        </div>
      }
    >
      {error ? (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-negative-text">
          {error}
        </p>
      ) : (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-medium">{t("因子表")}</h2>
              <span className="text-[10px] text-muted-foreground">
                {symbols.length} {t("只")} · {t(RANGE_CONFIG[range].label)}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="skeleton h-7 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="overflow-auto scroll-thin">
                <table className="w-full min-w-[760px] text-[11.5px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] text-muted-foreground">
                      {headerCell("symbol", t("代码"), "left")}
                      {headerCell("d20", t("动量 1M"))}
                      {headerCell("d60", t("动量 3M"))}
                      {headerCell("d120", t("动量 6M"))}
                      {headerCell("vol", t("年化波动"))}
                      {headerCell("sharpe", t("夏普"))}
                      {headerCell("dd", t("最大回撤"))}
                      {headerCell("win", t("胜率"))}
                      {headerCell("beta", t("Beta"))}
                      {headerCell("alpha", t("年化 Alpha"))}
                      <th className="px-2.5 py-2 text-right font-medium">{t("区间收益")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row) => (
                      <tr
                        key={row.symbol}
                        onClick={() => setFocus(row.symbol)}
                        className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-hover ${
                          focusRow?.symbol === row.symbol ? "bg-muted/60" : ""
                        }`}
                      >
                        <td className="px-2.5 py-1.5 font-medium">{row.symbol}</td>
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
                        <td className="num px-2.5 py-1.5 text-right">
                          {formatNumber(row.metrics.sharpe, 2)}
                        </td>
                        <td className="num px-2.5 py-1.5 text-right text-negative-text">
                          {formatPercent(row.metrics.maxDrawdown, 2)}
                        </td>
                        <td className="num px-2.5 py-1.5 text-right text-muted-foreground">
                          {formatPercent(row.metrics.winRate, 1).replace("+", "")}
                        </td>
                        <td className="num px-2.5 py-1.5 text-right">
                          {row.alphaBeta?.beta === null || row.alphaBeta === null
                            ? "--"
                            : formatNumber(row.alphaBeta.beta, 2)}
                        </td>
                        <td
                          className={`num px-2.5 py-1.5 text-right ${tone(
                            row.alphaBeta?.alphaAnnualized ?? null,
                          )}`}
                        >
                          {row.alphaBeta?.alphaAnnualized === null || row.alphaBeta === null
                            ? "--"
                            : formatPercent(row.alphaBeta.alphaAnnualized)}
                        </td>
                        <td className={`num px-2.5 py-1.5 text-right ${tone(row.metrics.totalReturn)}`}>
                          {formatPercent(row.metrics.totalReturn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h2 className="text-[13px] font-medium">{t("动量热力图")}</h2>
              <span className="text-[10px] text-muted-foreground">
                {t("颜色深浅代表动量强弱，绿强红弱")}
              </span>
            </div>
            {loading || sorted.length === 0 ? (
              <div className="skeleton m-4 h-40 rounded-lg" />
            ) : (
              <div className="p-2">
                <MomentumHeatmap
                  rows={sorted.map((row) => ({ symbol: row.symbol, momentum: row.metrics.momentum }))}
                  labels={{
                    symbol: t("代码"),
                    m1: t("动量 1M"),
                    m3: t("动量 3M"),
                    m6: t("动量 6M"),
                  }}
                />
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">{t("相关性矩阵")}</h2>
                <span className="text-[10px] text-muted-foreground">{t("日收益，最多 10 只")}</span>
              </div>
              {loading || rows.length === 0 ? (
                <div className="skeleton m-4 h-40 rounded-lg" />
              ) : (
                <div className="overflow-auto p-2 scroll-thin">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr>
                        <th />
                        {rows.slice(0, 10).map((row) => (
                          <th key={row.symbol} className="px-1 py-1 font-medium text-muted-foreground">
                            {row.symbol.slice(0, 4)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.map((line, index) => (
                        <tr key={rows[index]?.symbol ?? index}>
                          <td className="px-1 py-1 text-right font-medium text-muted-foreground">
                            {rows[index]?.symbol.slice(0, 4)}
                          </td>
                          {line.map((value, column) => (
                            <td key={column} className="p-0.5">
                              <div
                                className="num flex h-6 min-w-[34px] items-center justify-center rounded"
                                style={{ background: correlationColor(value) }}
                                title={value === null ? "--" : value.toFixed(2)}
                              >
                                {value === null ? "--" : value.toFixed(1)}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">
                  {t("风险统计")}
                  {focusRow && <span className="ml-1.5 text-[11px] text-muted-foreground">{focusRow.symbol}</span>}
                </h2>
                <span className="text-[10px] text-muted-foreground">{t("点击因子表切换")}</span>
              </div>
              {!focusRow ? (
                <p className="px-4 py-4 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>
              ) : (
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11.5px] sm:grid-cols-3">
                    {[
                      { label: t("区间收益"), value: formatPercent(focusRow.metrics.totalReturn) },
                      { label: t("年化收益"), value: formatPercent(focusRow.metrics.annualReturn) },
                      { label: t("年化波动"), value: formatPercent(focusRow.metrics.volatility, 1).replace("+", "") },
                      { label: t("夏普"), value: formatNumber(focusRow.metrics.sharpe, 2) },
                      { label: t("最大回撤"), value: formatPercent(focusRow.metrics.maxDrawdown) },
                      { label: t("胜率"), value: formatPercent(focusRow.metrics.winRate, 1).replace("+", "") },
                      { label: t("最好单日"), value: formatPercent(focusRow.metrics.bestDay) },
                      { label: t("最差单日"), value: formatPercent(focusRow.metrics.worstDay) },
                      { label: t("样本数"), value: String(focusRow.returns.length) },
                      {
                        label: t("Beta"),
                        value:
                          focusRow.alphaBeta?.beta == null
                            ? "--"
                            : formatNumber(focusRow.alphaBeta.beta, 2),
                      },
                      {
                        label: t("年化 Alpha"),
                        value:
                          focusRow.alphaBeta?.alphaAnnualized == null
                            ? "--"
                            : formatPercent(focusRow.alphaBeta.alphaAnnualized),
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-baseline justify-between gap-2">
                        <span className="text-[10.5px] text-muted-foreground">{item.label}</span>
                        <span className="num text-foreground/85">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 mb-1 text-[10.5px] text-muted-foreground">{t("日收益分布")}</p>
                  <div className="flex h-16 items-end gap-1">
                    {histogram.map((bin, index) => (
                      <div
                        key={index}
                        className="flex-1 rounded-t bg-accent/60"
                        style={{ height: `${Math.max(2, (bin.count / maxBin) * 100)}%` }}
                        title={`${bin.from.toFixed(1)}% ~ ${bin.to.toFixed(1)}% · ${bin.count}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function tone(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  return value >= 0 ? "text-positive-text" : "text-negative-text";
}

function correlationColor(value: number | null): string {
  if (value === null) return "var(--muted)";
  const magnitude = Math.min(1, Math.abs(value));
  const base = value >= 0 ? "var(--positive)" : "var(--negative)";
  return `color-mix(in srgb, ${base} ${Math.round(12 + magnitude * 55)}%, transparent)`;
}
