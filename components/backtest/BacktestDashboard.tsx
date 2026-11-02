"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageShell from "@/components/PageShell";
import EquityChart from "@/components/backtest/EquityChart";
import StrategyPicker from "@/components/backtest/StrategyPicker";
import SymbolPicker from "@/components/backtest/SymbolPicker";
import { useI18n } from "@/lib/i18n";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { DEFAULT_PARAMS, runBacktest, type BacktestParams } from "@/lib/backtest";
import { HISTORY_KEY, pushHistory, sanitizeHistory } from "@/lib/backtest-history";
import { DEFAULT_WATCHLIST, RANGE_CONFIG, type ChartPoint, type RangeKey } from "@/lib/types";

const BACKTEST_RANGES: RangeKey[] = ["1Y", "5Y", "MAX"];
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;

const CAPITALS = [1_000, 10_000, 100_000];

export default function BacktestDashboard() {
  const { t } = useI18n();
  const [symbol, setSymbol] = useState<string>(DEFAULT_WATCHLIST[0]);
  const [draft, setDraft] = useState<string>(DEFAULT_WATCHLIST[0]);
  const [history, setHistory] = useState<string[]>([DEFAULT_WATCHLIST[0]]);
  const [range, setRange] = useState<RangeKey>("5Y");
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  // 读取历史列表
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const list = sanitizeHistory(JSON.parse(raw));
        if (list.length > 0) setHistory(list);
      }
    } catch {
      // 忽略
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      // 忽略
    }
  }, [history]);

  // 只有合法代码才请求（避免删除输入时 404 报错）
  const load = useCallback(
    async (nextSymbol: string, nextRange: RangeKey) => {
      if (!SYMBOL_RE.test(nextSymbol)) return;
      const requestId = ++requestRef.current;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/chart?symbol=${encodeURIComponent(nextSymbol)}&range=${nextRange}&interval=1d`,
          { cache: "no-store" },
        );
        if (requestId !== requestRef.current) return;
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `加载失败（${response.status}）`);
        }
        const data = (await response.json()) as { points: ChartPoint[]; currency: string };
        if (requestId !== requestRef.current) return;
        setPoints(data.points ?? []);
        setCurrency(data.currency ?? "USD");
      } catch (err) {
        if (requestId !== requestRef.current) return;
        setPoints([]);
        setError(err instanceof Error ? err.message : "加载失败");
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(symbol, range);
  }, [symbol, range, load]);

  const result = useMemo(
    () => (points.length > 0 ? runBacktest(points, params) : null),
    [points, params],
  );

  function commitSymbol(next: string) {
    if (!SYMBOL_RE.test(next)) return;
    setSymbol(next);
    setHistory((prev) => pushHistory(prev, next));
  }

  const update = (patch: Partial<BacktestParams>) => setParams((prev) => ({ ...prev, ...patch }));

  const field = (
    key: keyof Pick<
      BacktestParams,
      "fast" | "slow" | "oversold" | "overbought" | "multiplier" | "signal" | "exitLookback" | "feeBps"
    >,
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
          if (!Number.isFinite(value)) return;
          update({ [key]: Math.min(max, Math.max(min, value)) } as Partial<BacktestParams>);
        }}
        aria-label={t(label)}
        className="num h-7 w-[76px] rounded-md border border-border bg-card px-2 text-right text-[12px] outline-none focus:border-accent/60"
      />
    </label>
  );

  const uses = (key: keyof BacktestParams) => Boolean(params.strategies.length);
  void uses;
  const hasMa = params.strategies.some((s) => s === "ma-cross" || s === "ema-cross" || s === "macd-cross");
  const hasRsi = params.strategies.includes("rsi-reversal");
  const hasBoll = params.strategies.includes("boll-breakout");
  const hasDonchian = params.strategies.includes("donchian");

  return (
    <PageShell
      title={t("策略回测")}
      description={t("6 种策略自由组合 · 自定义初始资金 · 本地回测，含手续费")}
      actions={
        <button
          type="button"
          onClick={() => void load(symbol, range)}
          className="h-7 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {t("刷新")}
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">{t("标的与区间")}</p>
            <SymbolPicker
              value={symbol}
              onChange={commitSymbol}
              onDraft={setDraft}
              history={history}
              onClearHistory={() => setHistory([])}
              invalid={draft.length > 0 && !SYMBOL_RE.test(draft)}
            />
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{t("回测区间")}</span>
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
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">
              {t("初始资金（USD）")}
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={100}
                step={1000}
                value={params.initialCapital}
                onChange={(event) => {
                  const value = Number.parseFloat(event.target.value);
                  if (!Number.isFinite(value)) return;
                  update({ initialCapital: Math.max(100, value) });
                }}
                aria-label={t("初始资金（USD）")}
                className="num h-7 w-full rounded-md border border-border bg-card px-2 text-right text-[12px] outline-none focus:border-accent/60"
              />
            </div>
            <div className="mt-1.5 flex gap-1">
              {CAPITALS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update({ initialCapital: value })}
                  className={`num flex-1 rounded border px-1 py-0.5 text-[10px] transition-colors ${
                    params.initialCapital === value
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {value >= 1000 ? `${value / 1000}k` : value}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">{t("策略")}</p>
              <span className="text-[10px] text-muted-foreground">
                {params.strategies.length} {t("个已选")}
              </span>
            </div>
            <StrategyPicker params={params} onChange={update} />

            <div className="mt-3 space-y-1.5 border-t border-border pt-2">
              {hasMa && field("fast", "快线周期", 2, 100)}
              {(hasMa || hasRsi || hasBoll || hasDonchian) &&
                field(
                  "slow",
                  hasRsi ? "RSI 周期" : hasBoll ? "计算周期" : hasDonchian ? "突破回看" : "慢线周期",
                  3,
                  200,
                )}
              {hasRsi && field("oversold", "买入阈值", 10, 45)}
              {hasRsi && field("overbought", "卖出阈值", 55, 90)}
              {hasBoll && field("multiplier", "标准差倍数", 1, 4, 0.1)}
              {params.strategies.includes("macd-cross") && field("signal", "MACD 信号", 2, 50)}
              {hasDonchian && field("exitLookback", "出场回看", 2, 60)}
              {field("feeBps", "手续费 bp", 0, 50)}
            </div>
          </section>
        </aside>

        <section className="space-y-4">
          {error ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-negative-text">
              {error}
            </p>
          ) : loading ? (
            <div className="skeleton h-[420px] rounded-xl" />
          ) : !result ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-[12px] text-muted-foreground">
              {t("数据点不足，无法回测")}
            </p>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                {[
                  { label: t("最终市值"), value: result.stats.finalValue === null ? "--" : formatPrice(result.stats.finalValue, currency), tone: (result.stats.profit ?? 0) >= 0 },
                  { label: t("盈亏"), value: result.stats.profit === null ? "--" : formatPrice(result.stats.profit, currency), tone: (result.stats.profit ?? 0) >= 0 },
                  { label: t("策略收益"), value: formatPercent(result.stats.totalReturn), tone: (result.stats.totalReturn ?? 0) >= 0 },
                  { label: t("买入持有"), value: formatPercent(result.stats.benchmarkReturn), tone: (result.stats.benchmarkReturn ?? 0) >= 0 },
                  { label: t("年化收益"), value: formatPercent(result.stats.cagr), tone: (result.stats.cagr ?? 0) >= 0 },
                  { label: t("最大回撤"), value: formatPercent(result.stats.maxDrawdown), tone: false },
                  { label: t("夏普"), value: formatNumber(result.stats.sharpe, 2), tone: null },
                  { label: t("胜率"), value: formatPercent(result.stats.winRate, 1).replace("+", ""), tone: null },
                  { label: t("交易次数"), value: String(result.stats.tradeCount), tone: null },
                  { label: t("平均持仓"), value: result.stats.avgDays === null ? "--" : `${formatNumber(result.stats.avgDays, 0)} ${t("天")}`, tone: null },
                  { label: t("持仓占比"), value: formatPercent(result.stats.exposure, 1).replace("+", ""), tone: null },
                  { label: t("初始资金"), value: formatPrice(result.stats.initialCapital, currency), tone: null },
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
                  <span className="text-[10px] text-muted-foreground">
                    {symbol} · {t(RANGE_CONFIG[range].label)}
                  </span>
                </div>
                <EquityChart
                  equity={result.equity}
                  benchmark={result.benchmark}
                  price={result.price}
                  trades={result.trades}
                  currency={currency}
                  labels={{
                    strategy: t("策略净值"),
                    benchmark: t("买入持有"),
                    price: t("股价"),
                    empty: t("暂无数据"),
                  }}
                />
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <h2 className="text-[13px] font-medium">{t("交易明细")}</h2>
                  <span className="text-[10px] text-muted-foreground">
                    {t("按收盘价成交，含手续费")}
                  </span>
                </div>
                {result.trades.length === 0 ? (
                  <p className="px-4 py-4 text-[11.5px] text-muted-foreground">
                    {t("该参数区间内没有完整交易")}
                  </p>
                ) : (
                  <div className="max-h-[380px] overflow-auto scroll-thin">
                    <table className="w-full min-w-[680px] text-[11.5px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="text-[10px] text-muted-foreground">
                          <th className="px-3 py-1.5 text-left font-medium">{t("买入")}</th>
                          <th className="px-3 py-1.5 text-left font-medium">{t("卖出")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("股数")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("盈亏")}</th>
                          <th className="px-3 py-1.5 text-right font-medium">{t("收益率")}</th>
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
                            <td className="num px-3 py-1.5 text-right text-muted-foreground">
                              {formatNumber(trade.shares, 2)}
                            </td>
                            <td className={`num px-3 py-1.5 text-right ${trade.pnl >= 0 ? "text-positive-text" : "text-negative-text"}`}>
                              {formatPrice(trade.pnl, currency)}
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
    </PageShell>
  );
}

function formatDay(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(
    new Date(timestamp * 1000),
  );
}
