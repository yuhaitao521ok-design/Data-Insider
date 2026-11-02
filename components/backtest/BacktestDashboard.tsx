"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import { useI18n } from "@/lib/i18n";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format";
import {
  DEFAULT_PARAMS,
  STRATEGY_KEYS,
  runBacktest,
  type BacktestParams,
  type StrategyKey,
} from "@/lib/backtest";
import { DEFAULT_WATCHLIST, RANGE_CONFIG, type ChartPoint, type RangeKey } from "@/lib/types";

const STRATEGY_LABEL: Record<StrategyKey, string> = {
  "ma-cross": "均线交叉",
  "rsi-reversal": "RSI 反转",
  "boll-breakout": "BOLL 突破",
};

const BACKTEST_RANGES: RangeKey[] = ["1Y", "5Y", "MAX"];

export default function BacktestDashboard() {
  const { t } = useI18n();
  const [symbol, setSymbol] = useState<string>(DEFAULT_WATCHLIST[0]);
  const [range, setRange] = useState<RangeKey>("5Y");
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`加载失败（${response.status}）`);
      const data = (await response.json()) as { points: ChartPoint[]; currency: string };
      setPoints(data.points ?? []);
      setCurrency(data.currency ?? "USD");
    } catch (err) {
      setPoints([]);
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [symbol, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const result = useMemo(
    () => (points.length > 0 ? runBacktest(points, params) : null),
    [points, params],
  );

  const curve = useMemo(() => {
    if (!result || result.equity.length < 2) return null;
    const width = 640;
    const height = 180;
    const all = [...result.equity.map((item) => item.value), ...result.benchmark.map((item) => item.value)];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;
    const toPath = (series: { value: number }[]) =>
      series
        .map((item, index) => {
          const x = (index / Math.max(series.length - 1, 1)) * width;
          const y = height - ((item.value - min) / span) * (height - 10) - 5;
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(" ");
    return {
      width,
      height,
      strategy: toPath(result.equity),
      benchmark: toPath(result.benchmark),
    };
  }, [result]);

  const field = (
    key: keyof Pick<BacktestParams, "fast" | "slow" | "oversold" | "overbought" | "multiplier" | "feeBps">,
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{t(label)}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={params[key]}
        onChange={(event) => {
          const value = Number.parseFloat(event.target.value);
          setParams((prev) => ({
            ...prev,
            [key]: Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : prev[key],
          }));
        }}
        aria-label={t(label)}
        className="num h-7 w-[80px] rounded-md border border-border bg-card px-2 text-right text-[12px] outline-none focus:border-accent/60"
      />
    </label>
  );

  return (
    <PageShell
      title={t("策略回测")}
      description={t("均线交叉 / RSI 反转 / BOLL 突破 · 本地回测，含手续费")}
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="h-7 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {t("刷新")}
        </button>
      }
    >
      {error ? (
        <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-negative-text">
          {error}
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">{t("标的与区间")}</p>
              <div className="flex items-center gap-1.5">
                <input
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value.toUpperCase())}
                  aria-label={t("股票代码")}
                  className="num h-7 w-[92px] rounded-md border border-border bg-card px-2 text-[12px] uppercase outline-none focus:border-accent/60"
                />
                <select
                  value={range}
                  onChange={(event) => setRange(event.target.value as RangeKey)}
                  aria-label={t("回测区间")}
                  className="h-7 flex-1 rounded-md border border-border bg-card px-1.5 text-[11.5px] outline-none"
                >
                  {BACKTEST_RANGES.map((item) => (
                    <option key={item} value={item}>
                      {t(RANGE_CONFIG[item].label)}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">{t("策略")}</p>
              <div className="space-y-1">
                {STRATEGY_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setParams((prev) => ({ ...prev, strategy: key }))}
                    aria-pressed={params.strategy === key}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11.5px] transition-colors ${
                      params.strategy === key
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {t(STRATEGY_LABEL[key])}
                    {params.strategy === key && <span>✓</span>}
                  </button>
                ))}
              </div>

              <div className="mt-3 space-y-1.5 border-t border-border pt-2">
                {(params.strategy === "ma-cross" || params.strategy === "boll-breakout") &&
                  field("slow", params.strategy === "ma-cross" ? "慢线周期" : "计算周期", 5, 200)}
                {params.strategy === "ma-cross" && field("fast", "快线周期", 2, 100)}
                {params.strategy === "rsi-reversal" && (
                  <>
                    {field("slow", "RSI 周期", 2, 50)}
                    {field("oversold", "买入阈值", 10, 45)}
                    {field("overbought", "卖出阈值", 55, 90)}
                  </>
                )}
                {params.strategy === "boll-breakout" && field("multiplier", "标准差倍数", 1, 4, 0.1)}
                {field("feeBps", "手续费 bp", 0, 50)}
              </div>
            </section>
          </aside>

          <section className="space-y-4">
            {loading ? (
              <div className="skeleton h-48 rounded-xl" />
            ) : !result ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-muted-foreground">
                {t("数据点不足，无法回测")}
              </p>
            ) : (
              <>
                <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                  {[
                    { label: t("策略收益"), value: formatPercent(result.stats.totalReturn), tone: (result.stats.totalReturn ?? 0) >= 0 },
                    { label: t("买入持有"), value: formatPercent(result.stats.benchmarkReturn), tone: (result.stats.benchmarkReturn ?? 0) >= 0 },
                    { label: t("年化收益"), value: formatPercent(result.stats.cagr), tone: (result.stats.cagr ?? 0) >= 0 },
                    { label: t("最大回撤"), value: formatPercent(result.stats.maxDrawdown), tone: false },
                    { label: t("夏普"), value: formatNumber(result.stats.sharpe, 2), tone: null },
                    { label: t("胜率"), value: formatPercent(result.stats.winRate, 1).replace("+", ""), tone: null },
                    { label: t("交易次数"), value: String(result.stats.tradeCount), tone: null },
                    { label: t("平均持仓"), value: result.stats.avgDays === null ? "--" : `${formatNumber(result.stats.avgDays, 0)} ${t("天")}`, tone: null },
                  ].map((item) => (
                    <div key={item.label} className="bg-card px-4 py-2.5">
                      <p className="text-[10.5px] text-muted-foreground">{item.label}</p>
                      <p
                        className={`num mt-0.5 text-[13px] ${
                          item.tone === null
                            ? "text-foreground"
                            : item.tone
                              ? "text-positive-text"
                              : "text-negative-text"
                        }`}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </section>

                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <h2 className="text-[13px] font-medium">{t("净值曲线")}</h2>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-0.5 w-3 rounded bg-accent" /> {t("策略")}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-0.5 w-3 rounded bg-muted-foreground/50" /> {t("买入持有")}
                      </span>
                    </div>
                  </div>
                  {curve ? (
                    <svg
                      viewBox={`0 0 ${curve.width} ${curve.height}`}
                      className="h-[180px] w-full"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={t("净值曲线")}
                    >
                      <path d={curve.benchmark} fill="none" strokeWidth="1.2" style={{ stroke: "var(--muted-foreground)", opacity: 0.55 }} vectorEffect="non-scaling-stroke" />
                      <path d={curve.strategy} fill="none" strokeWidth="1.6" style={{ stroke: "var(--accent)" }} vectorEffect="non-scaling-stroke" />
                    </svg>
                  ) : null}
                </section>

                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <h2 className="text-[13px] font-medium">{t("交易明细")}</h2>
                    <span className="text-[10px] text-muted-foreground">
                      {t("按收盘价成交，含手续费")}
                    </span>
                  </div>
                  {result.trades.length === 0 ? (
                    <p className="px-4 py-4 text-[11.5px] text-muted-foreground">{t("该参数区间内没有完整交易")}</p>
                  ) : (
                    <div className="max-h-[360px] overflow-auto scroll-thin">
                      <table className="w-full min-w-[560px] text-[11.5px]">
                        <thead className="sticky top-0 bg-card">
                          <tr className="text-[10px] text-muted-foreground">
                            <th className="px-3 py-1.5 text-left font-medium">{t("买入")}</th>
                            <th className="px-3 py-1.5 text-left font-medium">{t("卖出")}</th>
                            <th className="px-3 py-1.5 text-right font-medium">{t("收益")}</th>
                            <th className="px-3 py-1.5 text-right font-medium">{t("持有天数")}</th>
                            <th className="px-3 py-1.5 text-left font-medium">{t("出场原因")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.trades.map((trade) => (
                            <tr key={`${trade.entryDate}-${trade.exitDate}`} className="border-t border-border/60">
                              <td className="num px-3 py-1.5">
                                {formatDay(trade.entryDate)} · {formatPrice(trade.entryPrice, currency)}
                              </td>
                              <td className="num px-3 py-1.5">
                                {formatDay(trade.exitDate)} · {formatPrice(trade.exitPrice, currency)}
                              </td>
                              <td className={`num px-3 py-1.5 text-right ${trade.pnlPercent >= 0 ? "text-positive-text" : "text-negative-text"}`}>
                                {formatPercent(trade.pnlPercent)}
                              </td>
                              <td className="num px-3 py-1.5 text-right text-muted-foreground">{trade.days}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{t(trade.reason)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}

function formatDay(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(
    new Date(timestamp * 1000),
  );
}
