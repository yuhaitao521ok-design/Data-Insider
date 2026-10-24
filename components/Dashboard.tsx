"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchBox from "@/components/SearchBox";
import Sparkline from "@/components/Sparkline";
import PriceChart from "@/components/PriceChart";
import InsightPanel from "@/components/InsightPanel";
import {
  DEFAULT_WATCHLIST,
  RANGE_CONFIG,
  RANGE_KEYS,
  isRangeKey,
  type ChartResponse,
  type InsightResponse,
  type Quote,
  type RangeKey,
} from "@/lib/types";
import {
  formatCompact,
  formatPercent,
  formatPrice,
  formatTimeInZone,
} from "@/lib/format";

const WATCHLIST_KEY = "data-insider:watchlist:v1";
const RANGE_KEY = "data-insider:range:v1";
const AUTO_KEY = "data-insider:auto:v1";
const POLL_MS = 30_000;
const INTRADAY_POLL_MS = 60_000;

const SOURCE_LABEL: Record<Quote["source"], string> = {
  yahoo: "Yahoo Finance",
  nasdaq: "Nasdaq",
  perplexity: "Perplexity 估算",
};

type InsightData = (InsightResponse & { cached?: boolean }) | null;

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export default function Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([...DEFAULT_WATCHLIST]);
  const [selected, setSelected] = useState<string>(DEFAULT_WATCHLIST[0]);
  const [range, setRange] = useState<RangeKey>("1M");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [insight, setInsight] = useState<InsightData>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const quoteRequestRef = useRef(0);
  const chartRequestRef = useRef(0);

  /* ------------------------------ 本地持久化 ------------------------------ */

  useEffect(() => {
    try {
      const rawList = window.localStorage.getItem(WATCHLIST_KEY);
      if (rawList) {
        const parsed: unknown = JSON.parse(rawList);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .filter(
              (item): item is string =>
                typeof item === "string" && /^[A-Z0-9.^=-]{1,12}$/.test(item),
            )
            .slice(0, 20);
          if (cleaned.length > 0) {
            setWatchlist(cleaned);
            setSelected(cleaned[0]);
          }
        }
      }
      const savedRange = window.localStorage.getItem(RANGE_KEY);
      if (isRangeKey(savedRange)) setRange(savedRange.toUpperCase() as RangeKey);
      const savedAuto = window.localStorage.getItem(AUTO_KEY);
      if (savedAuto !== null) setAutoRefresh(savedAuto === "1");
    } catch {
      // localStorage 不可用（隐私模式等），忽略即可
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
      window.localStorage.setItem(RANGE_KEY, range);
      window.localStorage.setItem(AUTO_KEY, autoRefresh ? "1" : "0");
    } catch {
      // 忽略写入失败
    }
  }, [watchlist, range, autoRefresh, hydrated]);

  /* -------------------------------- 数据加载 ------------------------------- */

  const loadQuotes = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (watchlist.length === 0) {
        setQuotes({});
        setQuotesLoading(false);
        return;
      }
      const requestId = ++quoteRequestRef.current;
      if (!options.silent) setQuotesLoading(true);

      try {
        const response = await fetch(
          `/api/quotes?symbols=${encodeURIComponent(watchlist.join(","))}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(await readError(response, `加载行情失败（${response.status}）`));
        }
        const data = (await response.json()) as {
          quotes: Quote[];
          fetchedAt: string;
          stale: boolean;
        };
        if (requestId !== quoteRequestRef.current) return;

        const map: Record<string, Quote> = {};
        for (const item of data.quotes) map[item.symbol] = item;
        setQuotes(map);
        setLastUpdated(data.fetchedAt);
        setStale(Boolean(data.stale));
        setQuotesError(null);
      } catch (error) {
        if (requestId !== quoteRequestRef.current) return;
        setQuotesError(error instanceof Error ? error.message : "加载行情失败");
      } finally {
        if (requestId === quoteRequestRef.current) setQuotesLoading(false);
      }
    },
    [watchlist],
  );

  const loadChart = useCallback(
    async (symbol: string, nextRange: RangeKey, options: { silent?: boolean } = {}) => {
      const requestId = ++chartRequestRef.current;
      if (!options.silent) {
        setChartLoading(true);
        setChartError(null);
      }

      try {
        const response = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${nextRange}`,
          { cache: "no-store" },
        );
        if (!response.ok) {
          throw new Error(await readError(response, `加载走势失败（${response.status}）`));
        }
        const data = (await response.json()) as ChartResponse;
        if (requestId !== chartRequestRef.current) return;
        setChart(data);
        setChartError(null);
        setQuotes((prev) => ({ ...prev, [data.quote.symbol]: data.quote }));
      } catch (error) {
        if (requestId !== chartRequestRef.current) return;
        setChartError(error instanceof Error ? error.message : "加载走势失败");
      } finally {
        if (requestId === chartRequestRef.current) setChartLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    void loadQuotes();
  }, [hydrated, loadQuotes]);

  useEffect(() => {
    if (!autoRefresh || !hydrated) return;
    const id = window.setInterval(() => void loadQuotes({ silent: true }), POLL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, hydrated, loadQuotes]);

  useEffect(() => {
    if (!hydrated) return;
    setChart(null);
    void loadChart(selected, range);
  }, [hydrated, selected, range, loadChart]);

  useEffect(() => {
    if (!autoRefresh || !hydrated) return;
    if (range !== "1D" && range !== "5D") return;
    const id = window.setInterval(
      () => void loadChart(selected, range, { silent: true }),
      INTRADAY_POLL_MS,
    );
    return () => window.clearInterval(id);
  }, [autoRefresh, hydrated, selected, range, loadChart]);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { perplexity?: boolean } | null) => setAiEnabled(Boolean(data?.perplexity)))
      .catch(() => setAiEnabled(false));
  }, []);

  const requestInsight = useCallback(async () => {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const response = await fetch(
        `/api/insight?symbol=${encodeURIComponent(selected)}&range=${range}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response, "生成 AI 解读失败"));
      const data = (await response.json()) as InsightResponse & { cached?: boolean };
      setInsight(data);
    } catch (error) {
      setInsightError(error instanceof Error ? error.message : "生成 AI 解读失败");
    } finally {
      setInsightLoading(false);
    }
  }, [selected, range]);

  useEffect(() => {
    setInsight(null);
    setInsightError(null);
    setInsightLoading(false);
  }, [selected, range]);

  /* --------------------------------- 交互 --------------------------------- */

  function addSymbol(symbol: string) {
    setWatchlist((prev) => (prev.includes(symbol) ? prev : [...prev, symbol].slice(0, 20)));
    setSelected(symbol);
  }

  function removeSymbol(symbol: string) {
    const next = watchlist.filter((item) => item !== symbol);
    if (next.length === 0) return;
    setWatchlist(next);
    if (selected === symbol) setSelected(next[0]);
  }

  /* -------------------------------- 派生数据 ------------------------------- */

  const quote = chart?.quote ?? quotes[selected] ?? null;
  const changePercent = quote?.changePercent ?? null;
  const positive = (changePercent ?? 0) >= 0;
  const inWatchlist = watchlist.includes(selected);

  const periodChange = useMemo(() => {
    const points = chart?.points;
    if (!points || points.length < 2) return null;
    const first = points[0].close;
    const last = points[points.length - 1].close;
    if (!first) return null;
    return ((last - first) / first) * 100;
  }, [chart]);

  const periodExtremes = useMemo(() => {
    const points = chart?.points;
    if (!points || points.length === 0) return null;
    const highs = points.map((point) => point.high ?? point.close);
    const lows = points.map((point) => point.low ?? point.close);
    return { high: Math.max(...highs), low: Math.min(...lows) };
  }, [chart]);

  const lastUpdateLabel = lastUpdated
    ? formatTimeInZone(lastUpdated, "Asia/Shanghai", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  const currency = quote?.currency ?? "USD";
  const stats: { label: string; value: string; tone?: "up" | "down" }[] = [
    { label: "昨收", value: formatPrice(chart?.meta.previousClose ?? quote?.previousClose, currency) },
    { label: "今日最高", value: formatPrice(chart?.meta.dayHigh, currency) },
    { label: "今日最低", value: formatPrice(chart?.meta.dayLow, currency) },
    { label: "成交量", value: formatCompact(chart?.meta.volume) },
    {
      label: `${RANGE_CONFIG[range].label}涨跌`,
      value: formatPercent(periodChange),
      tone: (periodChange ?? 0) >= 0 ? "up" : "down",
    },
    { label: "区间最高", value: formatPrice(periodExtremes?.high, currency) },
    { label: "区间最低", value: formatPrice(periodExtremes?.low, currency) },
    {
      label: "52 周区间",
      value:
        chart?.meta.week52Low != null && chart?.meta.week52High != null
          ? `${formatPrice(chart.meta.week52Low, currency)} – ${formatPrice(chart.meta.week52High, currency)}`
          : "--",
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-terminal/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#2b5bd7] shadow-lg shadow-accent/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 17.5h4l3-8 3 5.5 2-3h6"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-semibold tracking-tight">Data Insider</p>
              <p className="text-[10px] text-muted">美股多周期行情</p>
            </div>
          </div>

          <div className="order-3 w-full sm:order-2 sm:w-auto sm:max-w-md sm:flex-1">
            <SearchBox onPick={addSymbol} />
          </div>

          <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
            <button
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition ${
                autoRefresh
                  ? "border-up/30 bg-up/[0.08] text-up"
                  : "border-line bg-white/[0.02] text-muted hover:text-ink"
              }`}
              title={autoRefresh ? "点击暂停自动刷新" : "点击开启自动刷新"}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-up live-dot" : "bg-muted"}`}
              />
              {autoRefresh ? "实时 30s" : "已暂停"}
            </button>
            <button
              type="button"
              onClick={() => {
                void loadQuotes();
                void loadChart(selected, range);
              }}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-line bg-white/[0.02] text-muted transition hover:text-ink"
              title="立即刷新"
              aria-label="立即刷新"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                className={quotesLoading || chartLoading ? "animate-spin" : ""}
              >
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-4 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-4 lg:px-6 lg:py-5">
        <aside className="panel mb-3 rounded-2xl p-2.5 lg:sticky lg:top-[84px] lg:mb-0 lg:flex lg:h-[calc(100vh-104px)] lg:flex-col">
          <div className="flex items-center justify-between px-1.5 pb-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold tracking-wide text-ink/90">自选股</h2>
              <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                {watchlist.length}
              </span>
            </div>
            <span className="text-[10px] text-muted/70">最多 20 个</span>
          </div>

          <div className="scroll-thin flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1.5 lg:overflow-y-auto lg:pb-0">
            {watchlist.map((symbol) => {
              const item = quotes[symbol];
              const up = (item?.changePercent ?? 0) >= 0;
              return (
                <div
                  key={symbol}
                  className={`group relative w-[172px] shrink-0 rounded-xl border p-2.5 transition-colors lg:w-auto ${
                    selected === symbol
                      ? "border-accent/45 bg-accent/[0.08]"
                      : "border-transparent hover:border-line hover:bg-white/[0.03]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(symbol)}
                    className="block w-full text-left"
                    aria-label={`查看 ${symbol} 行情`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold tracking-wide">{symbol}</span>
                      <span className="num text-[13px] font-medium">
                        {item ? formatPrice(item.price, item.currency) : "--"}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="max-w-[96px] truncate text-[10px] text-muted">
                        {item?.name ?? (quotesLoading ? "加载中…" : "暂无数据")}
                      </span>
                      <span className={`num text-[11px] ${up ? "text-up" : "text-down"}`}>
                        {formatPercent(item?.changePercent)}
                      </span>
                    </div>
                    <Sparkline
                      data={item?.sparkline ?? []}
                      positive={up}
                      className="mt-1.5 h-6 w-full opacity-80"
                    />
                  </button>

                  {watchlist.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSymbol(symbol)}
                      className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full border border-line bg-[#0a111d] text-[10px] text-muted transition hover:border-down/50 hover:text-down group-hover:flex"
                      title={`从自选股移除 ${symbol}`}
                      aria-label={`移除 ${symbol}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-auto hidden items-center justify-between border-t border-line/60 px-1.5 pt-2.5 text-[10px] text-muted/70 lg:flex">
            <span>Yahoo / Nasdaq</span>
            <span>{lastUpdateLabel ? `${lastUpdateLabel} 更新` : "等待数据"}</span>
          </div>
        </aside>


        <section className="min-w-0 space-y-4">
          {quotesError && (
            <div className="flex items-center gap-3 rounded-xl border border-down/30 bg-down/[0.06] px-3 py-2 text-xs text-down/90">
              <span className="flex-1">行情加载失败：{quotesError}</span>
              <button
                type="button"
                onClick={() => void loadQuotes()}
                className="rounded-md border border-down/40 px-2 py-1 transition hover:bg-down/10"
              >
                重试
              </button>
            </div>
          )}

          <article className="panel overflow-hidden rounded-2xl">
            <div className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{selected}</h1>
                    {quote?.exchange && (
                      <span className="rounded border border-line bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                        {quote.exchange}
                      </span>
                    )}
                    {quote?.source === "perplexity" && (
                      <span
                        className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                        title="Yahoo Finance 暂不可用，此报价由 Perplexity 联网检索估算，仅供参考"
                      >
                        Perplexity 估算
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => (inWatchlist ? removeSymbol(selected) : addSymbol(selected))}
                      className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                        inWatchlist
                          ? "border-amber-300/40 bg-amber-300/10 text-amber-200 hover:border-down/40 hover:text-down"
                          : "border-line text-muted hover:border-accent/40 hover:text-accent"
                      }`}
                      title={inWatchlist ? "从自选股移除" : "加入自选股"}
                    >
                      {inWatchlist ? "★ 已自选" : "☆ 加自选"}
                    </button>
                  </div>
                  <p className="mt-1 max-w-[280px] truncate text-xs text-muted sm:max-w-md">
                    {quote?.name ?? "—"}
                  </p>
                </div>

                <div className="text-right">
                  <div
                    className={`num text-2xl font-semibold tracking-tight sm:text-[32px] ${
                      positive ? "text-up" : "text-down"
                    }`}
                  >
                    {quote ? formatPrice(quote.price, quote.currency) : "--"}
                  </div>
                  <div
                    className={`num mt-0.5 text-xs sm:text-sm ${positive ? "text-up" : "text-down"}`}
                  >
                    {(quote?.change ?? 0) > 0 ? "+" : ""}
                    {formatPrice(quote?.change, quote?.currency)}（
                    {formatPercent(quote?.changePercent)}）
                  </div>
                  <div className="mt-1 text-[10px] text-muted/80">
                    美东{" "}
                    {quote?.marketTime
                      ? formatTimeInZone(quote.marketTime, "America/New_York", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--"}{" "}
                    · {quote ? SOURCE_LABEL[quote.source] : "—"}
                    {stale ? " · 缓存" : ""}
                  </div>
                </div>
              </div>

              <div className="scroll-thin mt-4 flex items-center gap-1 overflow-x-auto border-b border-line/60">
                {RANGE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRange(key)}
                    className={`relative shrink-0 px-2.5 pb-2 pt-1 text-xs transition ${
                      range === key ? "text-ink" : "text-muted hover:text-ink/80"
                    }`}
                  >
                    {RANGE_CONFIG[key].label}
                    {range === key && (
                      <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-accent" />
                    )}
                  </button>
                ))}
                <span className="ml-auto shrink-0 pb-2 pl-3 text-[10px] text-muted/60">
                  间隔 {chart?.interval ?? RANGE_CONFIG[range].interval}
                </span>
              </div>

              <div className="mt-3">
                {chartError ? (
                  <div className="flex h-[250px] flex-col items-center justify-center gap-3 sm:h-[310px] lg:h-[370px]">
                    <p className="max-w-md px-4 text-center text-xs leading-5 text-muted">
                      {chartError}
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadChart(selected, range)}
                      className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20"
                    >
                      重新加载
                    </button>
                    {(range === "1D" || range === "5D") && (
                      <button
                        type="button"
                        onClick={() => setRange("1M")}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:text-ink"
                      >
                        切换到 1 个月
                      </button>
                    )}
                  </div>
                ) : chart ? (
                  <PriceChart
                    points={chart.points}
                    range={range}
                    timezone={chart.timezone}
                    currency={chart.currency}
                    positive={positive}
                    reference={
                      range === "1D" || range === "5D" ? chart.meta.previousClose : null
                    }
                  />
                ) : (
                  <div className="skeleton h-[250px] w-full rounded-xl sm:h-[310px] lg:h-[370px]" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-px border-t border-line/60 bg-line/40 sm:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-panel px-3 py-2.5">
                  <p className="text-[10px] text-muted">{stat.label}</p>
                  <p
                    className={`num mt-0.5 truncate text-xs font-medium ${
                      stat.tone === "up"
                        ? "text-up"
                        : stat.tone === "down"
                          ? "text-down"
                          : "text-ink/90"
                    }`}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

          </article>

          <InsightPanel
            symbol={selected}
            range={range}
            enabled={aiEnabled}
            onRequest={requestInsight}
            data={insight}
            loading={insightLoading}
            error={insightError}
          />

        </section>
      </main>

      <footer className="mx-auto max-w-[1440px] px-4 pb-8 pt-2 text-[10px] leading-5 text-muted/60 lg:px-6">
        <p>
          数据来源：Yahoo Finance 与 Nasdaq 公开接口（可能延迟 15 分钟），AI 解读与兜底报价由
          Perplexity 提供。本页面仅供学习与研究，不构成任何投资建议。
        </p>
        <p className="mt-0.5">
          Data Insider · Next.js + Yahoo Finance + Perplexity · 快捷键{" "}
          <kbd className="rounded border border-line px-1">/</kbd> 聚焦搜索
        </p>
      </footer>

    </div>
  );
}


