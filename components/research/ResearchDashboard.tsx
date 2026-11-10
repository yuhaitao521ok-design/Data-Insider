"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PageShell from "@/components/PageShell";
import DrawdownChart from "@/components/backtest/DrawdownChart";
import CorrelationMatrix from "@/components/research/CorrelationMatrix";
import FactorGuide from "@/components/research/FactorGuide";
import FactorTable from "@/components/research/FactorTable";
import MiniLineChart from "@/components/research/MiniLineChart";
import MomentumHeatmap from "@/components/research/MomentumHeatmap";
import MonthlyReturnGrid from "@/components/research/MonthlyReturnGrid";
import PortfolioPanel from "@/components/research/PortfolioPanel";
import RiskReturnScatter from "@/components/research/RiskReturnScatter";
import SymbolPool from "@/components/research/SymbolPool";
import TrendAlignment from "@/components/research/TrendAlignment";
import type { ResearchRow, ResearchSortKey } from "@/components/research/types";
import { formatNumber, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  alphaBeta,
  dailyReturns,
  drawdownSeries,
  monthlyReturns,
  riskMetrics,
  rollingCorrelation,
  returnHistogram,
  timedReturns,
  trendStructure,
  type AlphaBeta,
} from "@/lib/quant";
import { DEFAULT_WATCHLIST, RANGE_CONFIG, type ChartPoint, type RangeKey } from "@/lib/types";

const WATCHLIST_KEY = "data-insider:watchlist:v1";
const UNIVERSE_KEY = "data-insider:research:universe:v1";
const RANGES: RangeKey[] = ["3M", "6M", "1Y", "5Y"];
/** 单次批量请求的标的数（接口上限 16，留点余量） */
const CHUNK_SIZE = 8;

type ClosePoint = { t: number; close: number };

const EMPTY_ALPHA_BETA: AlphaBeta = {
  beta: null,
  alphaAnnualized: null,
  correlation: null,
  trackingError: null,
  informationRatio: null,
  upCapture: null,
  downCapture: null,
  samples: 0,
};

function toChartPoints(points: ClosePoint[]): ChartPoint[] {
  return points.map((point) => ({
    t: point.t,
    open: point.close,
    high: point.close,
    low: point.close,
    close: point.close,
    volume: null,
  }));
}

function normalizeSymbol(value: string): string {
  const cleaned = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.\-]{0,11}$/.test(cleaned) ? cleaned : "";
}

function readSymbols(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(parsed.filter((item): item is string => typeof item === "string").map(normalizeSymbol)),
    ).filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

export default function ResearchDashboard() {
  const { t } = useI18n();
  const [symbols, setSymbols] = useState<string[]>([...DEFAULT_WATCHLIST]);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [closeMap, setCloseMap] = useState<Record<string, ClosePoint[]>>({});
  const [dataRange, setDataRange] = useState<RangeKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ResearchSortKey>("d60");
  const [sortDesc, setSortDesc] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideHighlight, setGuideHighlight] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const cacheRef = useRef(new Map<string, ClosePoint[]>());

  // 首次进入：优先用研究页自己的标的池，其次沿用自选股
  useEffect(() => {
    const own = readSymbols(window.localStorage.getItem(UNIVERSE_KEY));
    if (own.length > 0) {
      setSymbols(own);
      return;
    }
    const watchlist = readSymbols(window.localStorage.getItem(WATCHLIST_KEY));
    if (watchlist.length > 0) setSymbols(watchlist);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(UNIVERSE_KEY, JSON.stringify(symbols));
    } catch {
      // 忽略隐私模式写入失败
    }
  }, [symbols]);

  const load = useCallback(
    async (list: string[], targetRange: RangeKey, controller: AbortController) => {
      if (list.length === 0) {
        setCloseMap({});
        setDataRange(targetRange);
        setPending([]);
        setLoading(false);
        return;
      }

      const request = Array.from(new Set([...list, "SPY"]));
      const missing = request.filter((symbol) => !cacheRef.current.has(`${targetRange}:${symbol}`));

      if (missing.length === 0) {
        const next: Record<string, ClosePoint[]> = {};
        for (const symbol of request) {
          const cached = cacheRef.current.get(`${targetRange}:${symbol}`);
          if (cached) next[symbol] = cached;
        }
        setCloseMap(next);
        setDataRange(targetRange);
        setPending([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setPending(missing);

      try {
        for (let index = 0; index < missing.length; index += CHUNK_SIZE) {
          const chunk = missing.slice(index, index + CHUNK_SIZE);
          const response = await fetch(
            `/api/batch-chart?symbols=${encodeURIComponent(chunk.join(","))}&range=${targetRange}`,
            { cache: "no-store", signal: controller.signal },
          );
          if (!response.ok) throw new Error(`加载失败（${response.status}）`);
          const data = (await response.json()) as {
            series?: { symbol: string; points: ClosePoint[] }[];
          };
          const received: Record<string, ClosePoint[]> = {};
          for (const item of data.series ?? []) {
            cacheRef.current.set(`${targetRange}:${item.symbol}`, item.points);
            received[item.symbol] = item.points;
          }
          // 渐进渲染：每批到达就先显示，长标的池也能边加载边看
          setCloseMap((prev) => ({ ...prev, ...received }));
          setDataRange(targetRange);
          setPending((prev) => prev.filter((symbol) => !chunk.includes(symbol)));
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "加载失败");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setPending([]);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (reloadKey > 0) {
      for (const key of [...cacheRef.current.keys()]) {
        if (key.startsWith(`${range}:`)) cacheRef.current.delete(key);
      }
    }
    const controller = new AbortController();
    void load(symbols, range, controller);
    return () => controller.abort();
    // 以拼接字符串做依赖，数组引用变化不重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(","), range, reloadKey, load]);

  const bench = useMemo<ChartPoint[] | null>(() => {
    const raw = closeMap["SPY"];
    return raw && raw.length > 1 ? toChartPoints(raw) : null;
  }, [closeMap]);

  const benchTimed = useMemo(() => (bench ? timedReturns(bench) : []), [bench]);

  const rows = useMemo<ResearchRow[]>(() => {
    if (dataRange !== range) return [];
    return symbols
      .map((symbol) => ({ symbol, raw: closeMap[symbol] }))
      .filter(
        (item): item is { symbol: string; raw: ClosePoint[] } =>
          Array.isArray(item.raw) && item.raw.length > 1,
      )
      .map(({ symbol, raw }) => {
        const points = toChartPoints(raw);
        const timed = timedReturns(points);
        return {
          symbol,
          points,
          returns: dailyReturns(points),
          timed,
          metrics: riskMetrics(points),
          alphaBeta: benchTimed.length > 1 ? alphaBeta(timed, benchTimed) : EMPTY_ALPHA_BETA,
          trend: trendStructure(points),
        };
      });
  }, [symbols, closeMap, benchTimed, dataRange, range]);

  const sorted = useMemo(() => {
    const value = (key: ResearchSortKey, row: ResearchRow): number | string => {
      switch (key) {
        case "symbol":
          return row.symbol;
        case "resonance":
          return row.trend.score;
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
        case "sortino":
          return row.metrics.sortino ?? Number.NEGATIVE_INFINITY;
        case "dd":
          return row.metrics.maxDrawdown ?? Number.NEGATIVE_INFINITY;
        case "ddDays":
          return row.metrics.drawdown.longestDays ?? Number.NEGATIVE_INFINITY;
        case "win":
          return row.metrics.winRate ?? Number.NEGATIVE_INFINITY;
        case "beta":
          return row.alphaBeta.beta ?? Number.NEGATIVE_INFINITY;
        case "alpha":
          return row.alphaBeta.alphaAnnualized ?? Number.NEGATIVE_INFINITY;
        case "total":
          return row.metrics.totalReturn ?? Number.NEGATIVE_INFINITY;
      }
    };

    const copy = [...rows];
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

  const focusRow = useMemo(
    () => rows.find((row) => row.symbol === focus) ?? sorted[0] ?? null,
    [rows, focus, sorted],
  );

  const monthly = useMemo(() => (focusRow ? monthlyReturns(focusRow.points) : []), [focusRow]);
  const underwater = useMemo(() => (focusRow ? drawdownSeries(focusRow.points) : []), [focusRow]);
  const rolling = useMemo(
    () =>
      focusRow && benchTimed.length > 1
        ? rollingCorrelation(focusRow.timed, benchTimed, 60)
        : [],
    [focusRow, benchTimed],
  );

  function toggleSort(key: ResearchSortKey) {
    if (sortKey === key) setSortDesc((prev) => !prev);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function addSymbol(input: string) {
    const symbol = normalizeSymbol(input);
    if (!symbol) return;
    setSymbols((prev) => (prev.includes(symbol) ? prev : [...prev, symbol]));
  }

  function removeSymbol(symbol: string) {
    setSymbols((prev) => prev.filter((item) => item !== symbol));
    if (focus === symbol) setFocus(null);
  }

  function explain(id: string) {
    setGuideOpen(true);
    setGuideHighlight(id);
    window.setTimeout(() => {
      document.getElementById(`factor-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  const loadingCount = pending.length;
  const rangeLabel = t(RANGE_CONFIG[range].label);
  const days = (value: number | null) => (value === null ? "--" : `${value} ${t("天")}`);
  const detailMetrics = focusRow
    ? [
        { label: t("区间收益"), value: formatPercent(focusRow.metrics.totalReturn) },
        { label: t("年化收益"), value: formatPercent(focusRow.metrics.annualReturn) },
        {
          label: t("年化波动"),
          value: formatPercent(focusRow.metrics.volatility, 1).replace("+", ""),
        },
        {
          label: t("下行波动"),
          value: formatPercent(focusRow.metrics.downside, 1).replace("+", ""),
        },
        { label: t("夏普"), value: formatNumber(focusRow.metrics.sharpe, 2) },
        { label: t("索提诺"), value: formatNumber(focusRow.metrics.sortino, 2) },
        { label: t("卡玛"), value: formatNumber(focusRow.metrics.calmar, 2) },
        { label: t("最大回撤"), value: formatPercent(focusRow.metrics.maxDrawdown, 2) },
        { label: t("当前回撤"), value: formatPercent(focusRow.metrics.drawdown.current, 2) },
        { label: t("最长回撤"), value: days(focusRow.metrics.drawdown.longestDays) },
        { label: t("回撤修复"), value: days(focusRow.metrics.drawdown.recoveryDays) },
        {
          label: t("胜率"),
          value: formatPercent(focusRow.metrics.winRate, 1).replace("+", ""),
        },
        { label: t("最好单日"), value: formatPercent(focusRow.metrics.bestDay) },
        { label: t("最差单日"), value: formatPercent(focusRow.metrics.worstDay) },
        {
          label: t("VaR 95%"),
          value: formatPercent(focusRow.metrics.var95, 2).replace("+", ""),
        },
        {
          label: t("CVaR 95%"),
          value: formatPercent(focusRow.metrics.cvar95, 2).replace("+", ""),
        },
        { label: t("偏度"), value: formatNumber(focusRow.metrics.skew, 2) },
        { label: t("峰度"), value: formatNumber(focusRow.metrics.kurtosis, 2) },
        { label: t("Beta"), value: formatNumber(focusRow.alphaBeta.beta, 2) },
        { label: t("年化 Alpha"), value: formatPercent(focusRow.alphaBeta.alphaAnnualized) },
        {
          label: t("跟踪误差"),
          value: formatPercent(focusRow.alphaBeta.trackingError, 1).replace("+", ""),
        },
        { label: t("信息比率"), value: formatNumber(focusRow.alphaBeta.informationRatio, 2) },
        {
          label: t("上涨捕获"),
          value: formatPercent(focusRow.alphaBeta.upCapture, 0).replace("+", ""),
        },
        {
          label: t("下跌捕获"),
          value: formatPercent(focusRow.alphaBeta.downCapture, 0).replace("+", ""),
        },
        { label: t("样本数"), value: String(focusRow.returns.length) },
      ]
    : [];
  const histogram = focusRow ? returnHistogram(focusRow.returns) : [];
  const maxBin = histogram.length > 0 ? Math.max(...histogram.map((bin) => bin.count)) : 1;

  return (
    <PageShell
      title={t("量化研究")}
      description={t("标的池 · 因子表 · 相关性 · 风险统计（本地计算，数据按区间缓存）")}
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
            onClick={() => setReloadKey((prev) => prev + 1)}
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-medium">{t("标的池")}</h2>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {t("想研究谁就加谁：搜索或直接输入代码，数量没有上限，全部本地计算")}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {rows.length}/{symbols.length} {t("已加载")}
                {loadingCount > 0 && ` · ${t("加载中")} ${loadingCount}`}
                {" · "}
                {rangeLabel}
              </span>
            </div>
            <div className="p-3">
              <SymbolPool
                symbols={symbols}
                onAdd={addSymbol}
                onRemove={removeSymbol}
                onReset={() => setSymbols([...DEFAULT_WATCHLIST])}
                onClear={() => setSymbols([])}
                pending={pending}
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-medium">{t("因子表")}</h2>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {t("点表头排序、点 i 看因子解释、点行切换下方的单只分析")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">
                  {rows.length} {t("只")} · {rangeLabel}
                  {loadingCount > 0 && ` · ${t("加载中")}`}
                </span>
                <button
                  type="button"
                  onClick={() => setGuideOpen((prev) => !prev)}
                  className="h-7 rounded-md border border-border px-2 text-[10.5px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
                >
                  {guideOpen ? t("收起因子说明") : t("因子说明")}
                </button>
              </div>
            </div>

            <FactorTable
              rows={sorted}
              sortKey={sortKey}
              sortDesc={sortDesc}
              onSort={toggleSort}
              onFocus={setFocus}
              onExplain={explain}
              onRemove={removeSymbol}
              focusSymbol={focusRow?.symbol ?? null}
              loading={loading && rows.length === 0}
            />
          </section>

          <FactorGuide
            highlight={guideHighlight}
            open={guideOpen}
            onToggle={() => setGuideOpen((prev) => !prev)}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">{t("动量热力图")}</h2>
                <span className="text-[10px] text-muted-foreground">
                  {t("颜色深浅代表动量强弱，绿强红弱")}
                </span>
              </div>
              {loading && sorted.length === 0 ? (
                <div className="skeleton m-4 h-40 rounded-lg" />
              ) : (
                <div className="p-2">
                  <MomentumHeatmap
                    rows={sorted.map((row) => ({
                      symbol: row.symbol,
                      momentum: row.metrics.momentum,
                    }))}
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

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">{t("趋势结构")}</h2>
                <span className="text-[10px] text-muted-foreground">
                  {t("共振分 = 价格与均线、短长动量的方向一致性")}
                </span>
              </div>
              <TrendAlignment
                rows={sorted}
                focusSymbol={focusRow?.symbol ?? null}
                onFocus={setFocus}
              />
            </section>
          </div>

          <CorrelationMatrix
            symbols={symbols}
            rows={rows}
            loading={loading}
            pending={pending}
            rangeLabel={rangeLabel}
            onAdd={addSymbol}
            onRemove={removeSymbol}
            onReset={() => setSymbols([...DEFAULT_WATCHLIST])}
            onClear={() => setSymbols([])}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">{t("收益-风险象限")}</h2>
                <span className="text-[10px] text-muted-foreground">
                  {t("横轴年化波动，纵轴年化收益")}
                </span>
              </div>
              <RiskReturnScatter
                rows={rows}
                focusSymbol={focusRow?.symbol ?? null}
                onFocus={setFocus}
              />
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">{t("等权组合 vs 基准")}</h2>
                <span className="text-[10px] text-muted-foreground">
                  {t("标的池等权持有，对比 SPY")}
                </span>
              </div>
              <PortfolioPanel rows={rows} benchmark={bench} />
            </section>
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <div>
                <h2 className="text-[13px] font-medium">
                  {t("单只细节")}
                  {focusRow && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{focusRow.symbol}</span>
                  )}
                </h2>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                  {t("点因子表、趋势结构或象限图里的任意标的即可切换")}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {t("全部指标都在同一区间内计算")} · {rangeLabel}
              </span>
            </div>

            {!focusRow ? (
              <p className="px-4 py-6 text-[11.5px] text-muted-foreground">{t("暂无数据")}</p>
            ) : (
              <div className="grid divide-y divide-border xl:grid-cols-2 xl:divide-x xl:divide-y-0">
                <div className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11.5px] font-medium text-foreground">{t("风险统计")}</p>
                    <button
                      type="button"
                      onClick={() => explain("sharpe")}
                      className="text-[10px] text-muted-foreground transition-colors hover:text-accent"
                    >
                      {t("这些指标怎么读")}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-[11.5px] sm:grid-cols-3">
                    {detailMetrics.map((item) => (
                      <div key={item.label} className="flex items-baseline justify-between gap-2">
                        <span className="text-[10.5px] text-muted-foreground">{item.label}</span>
                        <span className="num text-foreground/85">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <p className="mb-1 mt-3 text-[10.5px] text-muted-foreground">
                    {t("日收益分布")}
                  </p>
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

                <div className="min-w-0">
                  <p className="px-4 pt-3 text-[11.5px] font-medium text-foreground">
                    {t("月度收益")}
                  </p>
                  <MonthlyReturnGrid symbol={focusRow.symbol} months={monthly} />
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">{t("回撤水下图")}</h2>
                <span className="text-[10px] text-muted-foreground">
                  {t("0% 线即历史新高，水下越深风险越大")}
                </span>
              </div>
              <div className="p-2">
                <DrawdownChart
                  drawdown={underwater}
                  label={t("回撤")}
                  empty={t("暂无数据")}
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-[13px] font-medium">{t("滚动相关性（60 日）")}</h2>
                <span className="text-[10px] text-muted-foreground">
                  {focusRow ? `${focusRow.symbol} vs SPY` : "--"}
                </span>
              </div>
              <div className="p-3">
                <MiniLineChart
                  points={rolling}
                  baseline={0}
                  color="var(--accent)"
                  format={(value) => value.toFixed(2)}
                  empty={t("样本不足 60 个共同交易日")}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("滚动相关性升高＝和大盘越来越同步；下降说明走出独立行情（分散价值提升）。")}
                </p>
              </div>
            </section>
          </div>

          <p className="text-[10.5px] text-muted-foreground">
            {t(
              "所有指标都在浏览器本地计算：日线收盘价按所选区间取数，夏普 / 索提诺 / 下行波动按 252 交易日年化，Alpha / Beta 以 SPY 为基准；数据只在切换标的池或区间时请求，且按区间缓存。",
            )}
          </p>
        </div>
      )}
    </PageShell>
  );
}
