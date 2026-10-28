"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchBox from "@/components/SearchBox";
import Sparkline from "@/components/Sparkline";
import PriceChart from "@/components/PriceChart";
import InsightPanel from "@/components/InsightPanel";
import ThemeToggle from "@/components/ThemeToggle";
import IndicatorControls from "@/components/IndicatorControls";
import IntervalSelect from "@/components/IntervalSelect";
import IndexOverview from "@/components/IndexOverview";
import PriceAlerts from "@/components/PriceAlerts";
import AlertToasts, { type AlertToastItem } from "@/components/AlertToasts";
import FundamentalsCard from "@/components/FundamentalsCard";
import { chartToCsv } from "@/lib/csv";
import {
  ALERTS_KEY,
  MAX_ALERTS,
  createAlert,
  describeAlert,
  evaluateAlerts,
  sanitizeAlerts,
  type AlertDirection,
  type PriceAlert,
} from "@/lib/alerts";
import {
  dropIndexAt,
  isWatchlistSort,
  moveItem,
  nextWatchlistSort,
  sortWatchlist,
  sortWatchlistLabel,
  type WatchlistSort,
} from "@/lib/watchlist";
import {
  DEFAULT_WATCHLIST,
  INDEX_SYMBOLS,
  RANGE_CONFIG,
  RANGE_KEYS,
  isIntervalAllowed,
  isIntervalKey,
  isIntradayInterval,
  isRangeKey,
  resolveInterval,
  type ChartMode,
  type ChartResponse,
  type Fundamentals,
  type IntervalKey,
  type InsightResponse,
  type Quote,
  type RangeKey,
} from "@/lib/types";
import {
  buildIndicatorRenderData,
  requiredIndicatorPoints,
  sanitizeIndicatorConfigs,
  type IndicatorConfig,
} from "@/lib/indicators";
import {
  formatCompact,
  formatPercent,
  formatPrice,
  formatTimeInZone,
} from "@/lib/format";

const WATCHLIST_KEY = "data-insider:watchlist:v1";
const RANGE_KEY = "data-insider:range:v1";
const AUTO_KEY = "data-insider:auto:v1";
const INDICATORS_KEY = "data-insider:indicators:v1";
const INTERVALS_KEY = "data-insider:intervals:v1";
const CHART_MODE_KEY = "data-insider:chart-mode:v1";
const WATCHLIST_SORT_KEY = "data-insider:watchlist-sort:v1";
const POLL_MS = 30_000;
const INTRADAY_POLL_MS = 60_000;

const CHART_MODES: { key: ChartMode; label: string; title: string }[] = [
  { key: "line", label: "折线", title: "折线图" },
  { key: "candle", label: "K线", title: "蜡烛图（K 线）" },
];

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
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [intervalByRange, setIntervalByRange] = useState<
    Partial<Record<RangeKey, IntervalKey>>
  >({});

  const interval = resolveInterval(range, intervalByRange[range]);

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [chartMode, setChartMode] = useState<ChartMode>("line");
  const [sortMode, setSortMode] = useState<WatchlistSort>("manual");
  const [drag, setDrag] = useState<{
    symbol: string;
    from: number;
    to: number;
    order: string[];
  } | null>(null);
  const dragRef = useRef<{
    symbol: string;
    from: number;
    to: number;
    order: string[];
    startX: number;
    startY: number;
    pointerId: number;
    active: boolean;
  } | null>(null);
  const watchlistListRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [toasts, setToasts] = useState<AlertToastItem[]>([]);
  const [notificationState, setNotificationState] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  const [fundamentals, setFundamentals] = useState<Fundamentals | null>(null);
  const [fundamentalsLoading, setFundamentalsLoading] = useState(false);
  const [fundamentalsError, setFundamentalsError] = useState<string | null>(null);

  const [chart, setChart] = useState<ChartResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);

  const [aiEnabled, setAiEnabled] = useState(false);
  const [insight, setInsight] = useState<InsightData>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const quoteRequestRef = useRef(0);
  const chartRequestRef = useRef(0);
  /** 每条提醒上一次观察到的满足状态（识别价格穿越，避免误报） */
  const alertSeenRef = useRef<Record<string, boolean>>({});

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
      const savedIndicators = window.localStorage.getItem(INDICATORS_KEY);
      if (savedIndicators) setIndicators(sanitizeIndicatorConfigs(JSON.parse(savedIndicators)));
      const savedIntervals = window.localStorage.getItem(INTERVALS_KEY);
      if (savedIntervals) {
        const parsed = JSON.parse(savedIntervals) as Record<string, unknown>;
        const next: Partial<Record<RangeKey, IntervalKey>> = {};
        for (const key of RANGE_KEYS) {
          const candidate = parsed?.[key];
          if (
            typeof candidate === "string" &&
            isIntervalKey(candidate) &&
            isIntervalAllowed(key, candidate)
          ) {
            next[key] = candidate;
          }
        }
        setIntervalByRange(next);
      }
      const savedMode = window.localStorage.getItem(CHART_MODE_KEY);
      if (savedMode === "line" || savedMode === "candle") setChartMode(savedMode);
      const savedSort = window.localStorage.getItem(WATCHLIST_SORT_KEY);
      if (isWatchlistSort(savedSort)) setSortMode(savedSort);
      const savedAlerts = window.localStorage.getItem(ALERTS_KEY);
      if (savedAlerts) setAlerts(sanitizeAlerts(JSON.parse(savedAlerts)));
      if (typeof Notification !== "undefined") {
        setNotificationState(Notification.permission);
      }
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
      window.localStorage.setItem(INDICATORS_KEY, JSON.stringify(indicators));
      window.localStorage.setItem(INTERVALS_KEY, JSON.stringify(intervalByRange));
      window.localStorage.setItem(CHART_MODE_KEY, chartMode);
      window.localStorage.setItem(WATCHLIST_SORT_KEY, sortMode);
      window.localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
    } catch {
      // 忽略写入失败
    }
  }, [
    watchlist,
    range,
    autoRefresh,
    indicators,
    intervalByRange,
    chartMode,
    sortMode,
    alerts,
    hydrated,
  ]);

  /* -------------------------------- 数据加载 ------------------------------- */

  const loadQuotes = useCallback(
    async (options: { silent?: boolean } = {}) => {
      // 指数条（SPY / QQQ / DIA）与自选股合并到同一个批量请求，避免额外请求
      const symbols = Array.from(new Set<string>([...watchlist, ...INDEX_SYMBOLS]));
      const requestId = ++quoteRequestRef.current;
      if (!options.silent) setQuotesLoading(true);

      try {
        const response = await fetch(
          `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`,
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
    async (
      symbol: string,
      nextRange: RangeKey,
      nextInterval: IntervalKey,
      options: { silent?: boolean } = {},
    ) => {
      const requestId = ++chartRequestRef.current;
      if (!options.silent) {
        setChartLoading(true);
        setChartError(null);
      }

      try {
        const response = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${nextRange}&interval=${nextInterval}`,
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
    void loadChart(selected, range, interval);
  }, [hydrated, selected, range, interval, loadChart]);

  useEffect(() => {
    if (!autoRefresh || !hydrated) return;
    if (!isIntradayInterval(interval)) return;
    const id = window.setInterval(
      () => void loadChart(selected, range, interval, { silent: true }),
      INTRADAY_POLL_MS,
    );
    return () => window.clearInterval(id);
  }, [autoRefresh, hydrated, selected, range, interval, loadChart]);

  const loadFundamentals = useCallback(async (symbol: string) => {
    setFundamentalsLoading(true);
    setFundamentalsError(null);
    try {
      const response = await fetch(
        `/api/fundamentals?symbol=${encodeURIComponent(symbol)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(await readError(response, `加载基本面失败（${response.status}）`));
      }
      const data = (await response.json()) as Fundamentals;
      setFundamentals(data);
    } catch (error) {
      setFundamentals(null);
      setFundamentalsError(error instanceof Error ? error.message : "加载基本面失败");
    } finally {
      setFundamentalsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setFundamentals(null);
    void loadFundamentals(selected);
  }, [hydrated, selected, loadFundamentals]);

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

  /* ------------------------------- 价格提醒 ------------------------------- */

  useEffect(() => {
    if (!hydrated || alerts.length === 0) return;

    const prices: Record<string, number | undefined> = {};
    for (const item of Object.values(quotes)) prices[item.symbol] = item.price;
    const currencyOf = (symbol: string) => quotes[symbol]?.currency ?? "USD";

    const { fired, seen } = evaluateAlerts(alerts, prices, alertSeenRef.current);
    alertSeenRef.current = seen;
    if (fired.length === 0) return;

    const triggeredAt = new Date().toISOString();
    const firedIds = new Set(fired.map((alert) => alert.id));
    setAlerts((prev) =>
      prev.map((alert) =>
        firedIds.has(alert.id)
          ? { ...alert, triggeredAt, triggeredPrice: prices[alert.symbol] ?? null }
          : alert,
      ),
    );

    setToasts((prev) =>
      [
        ...prev,
        ...fired.map((alert) => ({
          id: `${alert.id}-${triggeredAt}`,
          title: "价格提醒触发",
          body: describeAlert(alert, (value) => formatPrice(value, currencyOf(alert.symbol))),
          price: formatPrice(prices[alert.symbol] ?? null, currencyOf(alert.symbol)),
        })),
      ].slice(-3),
    );

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const alert of fired) {
        try {
          new Notification("价格提醒", {
            body: `${describeAlert(alert, (value) =>
              formatPrice(value, currencyOf(alert.symbol)),
            )}（现价 ${formatPrice(prices[alert.symbol] ?? null, currencyOf(alert.symbol))}）`,
            tag: alert.id,
          });
        } catch {
          // 部分浏览器（移动端 Safari 等）不支持直接构造 Notification，忽略即可
        }
      }
    }
  }, [hydrated, alerts, quotes]);

  const addAlert = useCallback(
    (direction: AlertDirection, price: number) => {
      setAlerts((prev) => [...prev, createAlert(selected, direction, price)].slice(-MAX_ALERTS));
    },
    [selected],
  );

  const removeAlert = useCallback((id: string) => {
    delete alertSeenRef.current[id];
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const reenableAlert = useCallback((id: string) => {
    // 清掉观察状态，重新启用后需要再穿越一次才触发
    delete alertSeenRef.current[id];
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === id ? { ...alert, triggeredAt: null, triggeredPrice: null } : alert,
      ),
    );
  }, []);

  const requestNotificationPermission = useCallback(() => {
    if (typeof Notification === "undefined") {
      setNotificationState("unsupported");
      return;
    }
    Notification.requestPermission()
      .then((state) => setNotificationState(state))
      .catch(() => setNotificationState(Notification.permission));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /* ------------------------------ 自选股排序 ------------------------------ */

  /** 按当前排序模式计算出的展示顺序（手动 / 涨跌幅降序 / 涨跌幅升序） */
  const displayedWatchlist = useMemo(
    () => sortWatchlist(watchlist, quotes, sortMode),
    [watchlist, quotes, sortMode],
  );
  /** 拖拽过程中冻结展示顺序，避免轮询刷新导致列表在指针下跳动 */
  const visibleWatchlist = drag ? drag.order : displayedWatchlist;

  function handleItemPointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    symbol: string,
    index: number,
  ) {
    // 触摸设备保留原生滚动，不做拖拽
    if (event.pointerType === "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragRef.current = {
      symbol,
      from: index,
      to: index,
      order: displayedWatchlist,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      active: false,
    };
  }

  function handleItemPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    if (!state.active) {
      // 超过阈值才算拖拽，避免影响点击选择
      if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 6) return;
      state.active = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    const list = watchlistListRef.current;
    if (!list) return;
    const rects = Array.from(
      list.querySelectorAll<HTMLElement>("[data-watchlist-item]"),
    ).map((item) => item.getBoundingClientRect());
    const target = dropIndexAt(rects, { x: event.clientX, y: event.clientY });

    state.to = target;
    setDrag({
      symbol: state.symbol,
      from: state.from,
      to: state.to,
      order: state.order,
    });
  }

  function finishDrag(event: React.PointerEvent<HTMLDivElement>, commit: boolean) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (!state.active) return;

    // 拖拽结束后紧跟着的 click 不应触发「选中」
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (commit && state.from !== state.to) {
      setWatchlist((current) => {
        // 拖拽期间发生过增删则放弃本次排序，避免丢数据
        if (current.length !== state.order.length) return current;
        return moveItem(state.order, state.from, state.to);
      });
      // 任何排序模式下拖拽，都把当前展示顺序固化为新的手动顺序
      if (sortMode !== "manual") setSortMode("manual");
    }

    setDrag(null);
  }

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

  function selectInterval(next: IntervalKey) {
    if (!isIntervalAllowed(range, next)) return;
    setIntervalByRange((prev) => ({ ...prev, [range]: next }));
  }

  function exportCsv() {
    if (!chart) return;
    const csv = chartToCsv(chart);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${chart.symbol}_${chart.range}_${chart.interval}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function focusSearch() {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="搜索股票"]');
    input?.focus();
    input?.select();
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

  const breadth = useMemo(() => {
    const items: Quote[] = watchlist
      .map((symbol) => quotes[symbol])
      .filter((item): item is Quote => Boolean(item) && item.changePercent !== null);
    if (items.length === 0) return null;

    const up = items.filter((item) => (item.changePercent ?? 0) > 0).length;
    const down = items.filter((item) => (item.changePercent ?? 0) < 0).length;
    const average =
      items.reduce((sum, item) => sum + (item.changePercent ?? 0), 0) / items.length;
    const sorted = [...items].sort(
      (a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0),
    );

    return {
      total: items.length,
      up,
      down,
      flat: items.length - up - down,
      average,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [watchlist, quotes]);

  const indicatorWarning = useMemo(() => {
    if (!chart || indicators.length === 0) return null;
    const available = chart.points.length;
    const issues = indicators.filter((config) => requiredIndicatorPoints(config) > available);
    if (issues.length === 0) return null;

    const rangeIndex = (RANGE_KEYS as readonly RangeKey[]).indexOf(range);
    const suggest = rangeIndex >= 0 && rangeIndex < RANGE_KEYS.length - 1
        ? (RANGE_KEYS[rangeIndex + 1] as RangeKey)
        : null;
    return {
      available,
      label: issues
        .map((config) => `${config.type} 需 ${requiredIndicatorPoints(config)} 个`)
        .join("、"),
      suggest,
    };
  }, [chart, indicators, range]);

  const indicatorData = useMemo(
    () => (chart ? buildIndicatorRenderData(chart.points, indicators) : { panes: [], overlays: [] }),
    [chart, indicators],
  );

  /** 当前标的的价格提醒线（画在主图上） */
  const chartAlertLines = useMemo(
    () =>
      alerts
        .filter((alert) => alert.symbol === selected)
        .map((alert) => ({ id: alert.id, price: alert.price, direction: alert.direction })),
    [alerts, selected],
  );

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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:px-6">
          <a href="#top" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 16.5 8.5 10l3.6 4.2L16.5 7.5H20"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="4" cy="16.5" r="1.7" fill="currentColor" />
              </svg>
            </span>
            <span className="text-[15px] font-medium tracking-tight">Data Insider</span>
          </a>

          <nav className="ml-2 hidden items-center gap-0.5 lg:flex" aria-label="页面导航">
            {[
              { label: "行情", href: "#market" },
              { label: "自选股", href: "#watchlist" },
              ...(aiEnabled ? [{ label: "AI 解读", href: "#insight" }] : []),
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="order-4 w-full sm:order-none sm:ml-auto sm:w-[260px]">
            <SearchBox onPick={addSymbol} />
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
            <button
              type="button"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] transition-colors hover:bg-muted ${
                autoRefresh ? "text-foreground" : "text-muted-foreground"
              }`}
              title={autoRefresh ? "点击暂停自动刷新" : "点击开启自动刷新"}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  autoRefresh ? "bg-positive live-dot" : "bg-muted-foreground/40"
                }`}
              />
              <span className="hidden sm:inline">{autoRefresh ? "实时" : "已暂停"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                void loadQuotes();
                void loadChart(selected, range, interval);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="立即刷新"
              aria-label="立即刷新"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                className={quotesLoading || chartLoading ? "animate-spin" : ""}
                aria-hidden="true"
              >
                <path
                  d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <ThemeToggle />

            <a
              href="https://github.com/yuhaitao521ok-design/Data-Insider"
              target="_blank"
              rel="noreferrer noopener"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="GitHub 仓库"
              title="GitHub 仓库"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.64 1.03 2.76 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
                  fill="currentColor"
                />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-[1440px] px-4 py-5 lg:px-6">
        <div id="market" className="mb-4 flex scroll-mt-20 flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-[24px] font-medium leading-tight tracking-tight">美股行情</h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              多周期报价与走势 · Yahoo Finance / Nasdaq
              {aiEnabled ? " · Perplexity AI" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[10.5px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  quote?.source === "perplexity" ? "bg-amber-500" : "bg-positive"
                }`}
              />
              {quote ? SOURCE_LABEL[quote.source] : "连接中"}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  autoRefresh ? "bg-positive live-dot" : "bg-muted-foreground/40"
                }`}
              />
              最后更新
              <span className="num text-foreground/80">{lastUpdateLabel ?? "--"}</span>
              <span>（北京时间）</span>
            </span>
          </div>
        </div>

        <IndexOverview
          quotes={quotes}
          loading={quotesLoading}
          selected={selected}
          onSelect={setSelected}
        />

        {breadth && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">自选股概览</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              <span className="num text-foreground/80">{breadth.up}</span> 涨
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-negative" />
              <span className="num text-foreground/80">{breadth.down}</span> 跌
            </span>
            {breadth.flat > 0 && (
              <span>
                <span className="num text-foreground/80">{breadth.flat}</span> 平
              </span>
            )}
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span>
              平均{" "}
              <span
                className={`num ${
                  breadth.average >= 0 ? "text-positive-text" : "text-negative-text"
                }`}
              >
                {formatPercent(breadth.average)}
              </span>
            </span>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span>
              最强 <span className="font-medium text-foreground">{breadth.best.symbol}</span>{" "}
              <span
                className={`num ${
                  (breadth.best.changePercent ?? 0) >= 0
                    ? "text-positive-text"
                    : "text-negative-text"
                }`}
              >
                {formatPercent(breadth.best.changePercent)}
              </span>
            </span>
            <span>
              最弱 <span className="font-medium text-foreground">{breadth.worst.symbol}</span>{" "}
              <span
                className={`num ${
                  (breadth.worst.changePercent ?? 0) >= 0
                    ? "text-positive-text"
                    : "text-negative-text"
                }`}
              >
                {formatPercent(breadth.worst.changePercent)}
              </span>
            </span>
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside
            id="watchlist"
            className="scroll-mt-20 overflow-hidden rounded-xl border border-border bg-card lg:sticky lg:top-[68px] lg:flex lg:max-h-[calc(100vh-88px)] lg:flex-col"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-medium">自选股</h2>
                <span className="num rounded-full bg-muted px-1.5 text-[10px] leading-4 text-muted-foreground">
                  {watchlist.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSortMode((prev) => nextWatchlistSort(prev))}
                  aria-pressed={sortMode !== "manual"}
                  aria-label={`按涨跌幅排序（当前：${sortWatchlistLabel(sortMode)}）`}
                  title={`按涨跌幅排序 · 当前：${sortWatchlistLabel(sortMode)}（点击切换）`}
                  className={`inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] transition-colors ${
                    sortMode === "manual"
                      ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                      : "bg-accent-soft text-accent"
                  }`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M7.5 19V5.5m0 0L4.5 8.5m3-3 3 3M16.5 5v13.5m0 0 3-3m-3 3-3-3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  涨跌幅
                  <span className="num" aria-hidden="true">
                    {sortMode === "change-desc" ? "↓" : sortMode === "change-asc" ? "↑" : "↕"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={focusSearch}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="添加自选股"
                  title="添加自选股"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div
              ref={watchlistListRef}
              className="scroll-thin flex gap-1 overflow-x-auto p-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto"
              aria-label="自选股列表（可拖动排序）"
            >
              {visibleWatchlist.map((symbol, index) => {
                const item = quotes[symbol];
                const up = (item?.changePercent ?? 0) >= 0;
                const isDragging = drag?.symbol === symbol;
                const isDropTarget = drag !== null && drag.to === index && drag.symbol !== symbol;
                return (
                  <div
                    key={symbol}
                    data-watchlist-item
                    onPointerDown={(event) => handleItemPointerDown(event, symbol, index)}
                    onPointerMove={handleItemPointerMove}
                    onPointerUp={(event) => finishDrag(event, true)}
                    onPointerCancel={(event) => finishDrag(event, false)}
                    className={`group relative w-[236px] shrink-0 select-none rounded-lg border transition-colors lg:w-auto ${
                      isDragging
                        ? "z-10 cursor-grabbing border-accent/50 bg-card opacity-70 shadow-[var(--shadow-pop)]"
                        : `cursor-grab ${
                            selected === symbol
                              ? "border-border bg-muted"
                              : "border-transparent hover:bg-hover"
                          }`
                    } ${isDropTarget ? "border-accent/40 bg-accent-soft/30" : ""}`}
                  >
                    <span
                      className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    >
                      <svg width="9" height="14" viewBox="0 0 10 16" fill="currentColor">
                        <circle cx="3" cy="4" r="1.1" />
                        <circle cx="7" cy="4" r="1.1" />
                        <circle cx="3" cy="8" r="1.1" />
                        <circle cx="7" cy="8" r="1.1" />
                        <circle cx="3" cy="12" r="1.1" />
                        <circle cx="7" cy="12" r="1.1" />
                      </svg>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        // 拖拽松手后的 click 不应该切换选中
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        setSelected(symbol);
                      }}
                      className="flex w-full items-center gap-2 py-2 pl-4 pr-2.5 text-left"
                      aria-label={`查看 ${symbol} 行情`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-medium leading-4">{symbol}</span>
                          {item?.source === "perplexity" && (
                            <span
                              className="h-1 w-1 rounded-full bg-amber-500"
                              title="AI 估算报价"
                            />
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
                          {item?.name ?? (quotesLoading ? "加载中…" : "暂无数据")}
                        </p>
                      </div>

                      <Sparkline
                        data={item?.sparkline ?? []}
                        positive={up}
                        className="h-6 w-12 shrink-0"
                      />

                      <div className="w-[68px] shrink-0 text-right">
                        <p className="num text-[12.5px] leading-4">
                          {item ? formatPrice(item.price, item.currency) : "--"}
                        </p>
                        <p
                          className={`num mt-0.5 text-[11px] leading-4 ${
                            up ? "text-positive-text" : "text-negative-text"
                          }`}
                        >
                          {formatPercent(item?.changePercent)}
                        </p>
                      </div>
                    </button>

                    {watchlist.length > 1 && (
                      <button
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => removeSymbol(symbol)}
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-[10px] leading-none text-muted-foreground shadow-sm transition-colors hover:border-negative/40 hover:text-negative-text group-hover:flex"
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

            <div className="mt-auto hidden items-center justify-between border-t border-border px-4 py-2 text-[10.5px] text-muted-foreground lg:flex">
              <span className="truncate">
                {sortMode === "manual" ? "Yahoo / Nasdaq" : `按${sortWatchlistLabel(sortMode)}`}
              </span>
              <span className="num">{lastUpdateLabel ?? "--"}</span>
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            {quotesError && (
              <div className="flex items-center gap-3 rounded-xl border border-negative/25 bg-negative-soft px-3 py-2 text-[12px] text-negative-text">
                <span className="flex-1">行情加载失败：{quotesError}</span>
                <button
                  type="button"
                  onClick={() => void loadQuotes()}
                  className="rounded-md border border-negative/30 px-2 py-1 text-[11px] transition-colors hover:bg-negative/10"
                >
                  重试
                </button>
              </div>
            )}

            <article className="rounded-xl border border-border bg-card">
              <div className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[19px] font-medium leading-6 tracking-tight">
                        {selected}
                      </h2>
                      {quote?.exchange && (
                        <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground">
                          {quote.exchange}
                        </span>
                      )}
                      {quote?.source === "perplexity" && (
                        <span
                          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] leading-4 text-amber-600 dark:text-amber-400"
                          title="Yahoo / Nasdaq 暂不可用，此报价由 Perplexity 联网检索估算，仅供参考"
                        >
                          AI 估算
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          inWatchlist ? removeSymbol(selected) : addSymbol(selected)
                        }
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-4 transition-colors ${
                          inWatchlist
                            ? "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                            : "border-accent/30 bg-accent-soft text-accent hover:border-accent/50"
                        }`}
                        title={inWatchlist ? "从自选股移除" : "加入自选股"}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill={inWatchlist ? "currentColor" : "none"}
                          aria-hidden="true"
                        >
                          <path
                            d="m12 3.5 2.6 5.3 5.9.9-4.3 4.2 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.2 5.9-.9L12 3.5Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {inWatchlist ? "已自选" : "加自选"}
                      </button>
                    </div>
                    <p className="mt-1 max-w-[320px] truncate text-[12px] text-muted-foreground sm:max-w-md">
                      {quote?.name ?? "—"}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="num text-[28px] font-medium leading-none tracking-tight">
                      {quote ? formatPrice(quote.price, quote.currency) : "--"}
                    </div>
                    <div
                      className={`num mt-2 inline-flex items-center gap-1 text-[13px] ${
                        positive ? "text-positive-text" : "text-negative-text"
                      }`}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d={positive ? "M7 17 17 7M17 7H8M17 7v9" : "M7 7l10 10M17 17H8M17 17V8"}
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {(quote?.change ?? 0) > 0 ? "+" : ""}
                      {formatPrice(quote?.change, quote?.currency)}
                      <span className="opacity-75">（{formatPercent(quote?.changePercent)}）</span>
                    </div>
                    <p className="mt-1.5 text-[10.5px] text-muted-foreground">
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
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                  <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                    {RANGE_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRange(key)}
                        aria-pressed={range === key}
                        className={`h-7 rounded-md px-2.5 text-[12px] transition-colors ${
                          range === key
                            ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {RANGE_CONFIG[key].label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <div
                      className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
                      role="group"
                      aria-label="图表类型"
                    >
                      {CHART_MODES.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setChartMode(option.key)}
                          aria-pressed={chartMode === option.key}
                          title={option.title}
                          className={`h-6 rounded-md px-1.5 text-[11px] transition-colors ${
                            chartMode === option.key
                              ? "bg-card font-medium text-foreground shadow-sm dark:bg-overlay dark:shadow-none"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <IntervalSelect range={range} value={interval} onChange={selectInterval} />
                    <IndicatorControls configs={indicators} onChange={setIndicators} />
                    <PriceAlerts
                      symbol={selected}
                      currency={currency}
                      currentPrice={quote?.price ?? null}
                      alerts={alerts}
                      notificationState={notificationState}
                      onCreate={addAlert}
                      onRemove={removeAlert}
                      onReenable={reenableAlert}
                      onRequestPermission={requestNotificationPermission}
                    />
                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={!chart}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="导出 CSV"
                      title="导出当前图表数据（CSV）"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M12 3v11m0 0 4-4m-4 4-4-4M5 17.5V20h14v-2.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                {indicatorWarning && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1.5 text-[10.5px] leading-4 text-amber-700 dark:text-amber-300">
                    <span className="flex-1">
                      当前周期仅 {indicatorWarning.available} 个数据点，{indicatorWarning.label}数据点才能完整计算。
                    </span>
                    {indicatorWarning.suggest && (
                      <button
                        type="button"
                        onClick={() => setRange(indicatorWarning.suggest as RangeKey)}
                        className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] transition-colors hover:bg-amber-500/10"
                      >
                        切换到 {RANGE_CONFIG[indicatorWarning.suggest].label}
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-3">
                  {chartError ? (
                    <div className="flex h-[250px] flex-col items-center justify-center gap-2.5 sm:h-[310px] lg:h-[360px]">
                      <p className="max-w-md px-4 text-center text-[12px] leading-5 text-muted-foreground">
                        {chartError}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void loadChart(selected, range, interval)}
                          className="h-8 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background transition-opacity hover:opacity-90"
                        >
                          重新加载
                        </button>
                        {(range === "1D" || range === "5D") && (
                          <button
                            type="button"
                            onClick={() => setRange("1M")}
                            className="h-8 rounded-lg border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            切换到 1 个月
                          </button>
                        )}
                      </div>
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
                      interval={interval}
                      overlays={indicatorData.overlays}
                      panes={indicatorData.panes}
                      mode={chartMode}
                      alertLines={chartAlertLines}
                    />
                  ) : (
                    <div className="skeleton h-[250px] w-full rounded-lg sm:h-[310px] lg:h-[360px]" />
                  )}
                </div>

              </div>

              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl border-t border-border bg-border sm:grid-cols-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="bg-card px-4 py-3">
                    <p className="text-[10.5px] text-muted-foreground">{stat.label}</p>
                    <p
                      className={`num mt-1 truncate text-[12.5px] ${
                        stat.tone === "up"
                          ? "text-positive-text"
                          : stat.tone === "down"
                            ? "text-negative-text"
                            : "text-foreground"
                      }`}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <FundamentalsCard
              symbol={selected}
              price={quote?.price ?? null}
              currency={currency}
              data={fundamentals}
              loading={fundamentalsLoading}
              error={fundamentalsError}
              onRetry={() => void loadFundamentals(selected)}
            />

            {aiEnabled && (
            <div id="insight" className="scroll-mt-20">
              <InsightPanel
                symbol={selected}
                range={range}
                enabled={aiEnabled}
                onRequest={requestInsight}
                data={insight}
                loading={insightLoading}
                error={insightError}
              />
            </div>
            )}


          </section>
        </div>

      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <p>
            数据来源 Yahoo Finance / Nasdaq / Perplexity · 行情可能延迟 15 分钟 · 仅供学习研究，不构成投资建议
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/yuhaitao521ok-design/Data-Insider"
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
            <span className="hidden sm:inline">Data Insider</span>
          </div>
        </div>
      </footer>

      <AlertToasts items={toasts} onDismiss={dismissToast} />

    </div>
  );
}
