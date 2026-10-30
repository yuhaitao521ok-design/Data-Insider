import {
  INTERVAL_CONFIG,
  type ChartPoint,
  type ChartResponse,
  type Fundamentals,
  type IntervalKey,
  type ExtendedQuote,
  type Quote,
  type RangeKey,
} from "@/lib/types";
import { parseEasternTimestamp, reconcileChange } from "@/lib/quote";
import { sessionFromNasdaqStatus } from "@/lib/session";

/**
 * Nasdaq 官方行情接口（无需 API Key），作为 Yahoo 的兜底数据源。
 *
 *  - /api/quote/{symbol}/info   最新价、涨跌、成交量、52 周区间
 *  - /api/quote/{symbol}/chart  日线历史（可自行聚合为周线 / 月线）
 *
 * 注意：该接口没有分时数据，因此 1D / 5D 仍然只能依赖 Yahoo 或 Perplexity。
 */

const BASE = "https://api.nasdaq.com/api";
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
};

export class NasdaqError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
    readonly code: "not_found" | "upstream_error" | "unsupported_interval" = "upstream_error",
  ) {
    super(message);
    this.name = "NasdaqError";
  }
}

interface NasdaqEnvelope<T> {
  data: T | null;
  message?: string | null;
  status?: { rCode?: number; bCodeMessage?: Array<{ errorMessage?: string }> | null };
}

interface NasdaqInfo {
  symbol?: string;
  companyName?: string;
  exchange?: string;
  primaryData?: {
    lastSalePrice?: string;
    netChange?: string;
    percentageChange?: string;
    lastTradeTimestamp?: string;
    volume?: string;
    isRealTime?: boolean;
  };
  secondaryData?: { lastSalePrice?: string; netChange?: string; percentageChange?: string } | null;
  marketStatus?: string;
  keyStats?: {
    fiftyTwoWeekHighLow?: { value?: string };
    dayrange?: { value?: string };
  };
}

interface NasdaqChartRow {
  x?: number;
  y?: number;
  z?: {
    high?: string;
    low?: string;
    open?: string;
    close?: string;
    volume?: string;
    dateTime?: string;
  };
}

interface NasdaqChart {
  symbol?: string;
  company?: string;
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
  previousClose?: string;
  timeAsOf?: string;
  chart?: NasdaqChartRow[] | null;
}

const assetClassCache = new Map<string, "stocks" | "etf">();

function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value) return null;
  const cleaned = value.replace(/[$,%\s,]/g, "").replace(/^\+/, "");
  if (!cleaned || cleaned.toUpperCase() === "N/A" || cleaned === "NA" || cleaned === "--") return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  // info 接口给的是美东时间字符串（"Oct 28, 2026 9:33 AM ET"，可能带 "Closed at" 前缀），
  // chart 接口给的是 "YYYY-MM-DD"。两种都支持，避免 marketTime 变成 null。
  const eastern = parseEasternTimestamp(value);
  if (eastern) return eastern;

  const parsed = new Date(`${value} 20:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parse52Week(value: string | undefined): { low: number | null; high: number | null } {
  if (!value) return { low: null, high: null };
  const [low, high] = value.split("-").map((part) => parseNumber(part));
  return { low: low ?? null, high: high ?? null };
}

export async function requestNasdaq<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new NasdaqError("连接 Nasdaq 接口超时", 504);
  }

  if (response.status === 404) throw new NasdaqError("Nasdaq 未找到该代码", 404, "not_found");
  if (!response.ok) throw new NasdaqError(`Nasdaq 接口异常（${response.status}）`);

  const body = (await response.json()) as NasdaqEnvelope<T>;
  if (!body.data) {
    throw new NasdaqError(
      body.status?.bCodeMessage?.[0]?.errorMessage || "Nasdaq 未返回有效数据",
      502,
    );
  }
  return body.data;
}

async function fetchInfo(symbol: string): Promise<NasdaqInfo> {
  const cached = assetClassCache.get(symbol);
  const candidates: Array<"stocks" | "etf"> = cached ? [cached] : ["stocks", "etf"];

  let lastError: unknown = null;
  for (const assetClass of candidates) {
    try {
      const info = await requestNasdaq<NasdaqInfo>(
        `/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetClass}`,
      );
      if (!info.primaryData?.lastSalePrice) throw new NasdaqError("Nasdaq 未返回有效报价", 404);
      assetClassCache.set(symbol, assetClass);
      return info;
    } catch (error) {
      // 股票/ETF 的 assetclass 不同，第一个失败时继续尝试下一个
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new NasdaqError("Nasdaq 未找到该代码", 404, "not_found");
}

function cleanCompanyName(name: string | undefined, symbol: string): string {
  if (!name) return symbol;
  return name
    .replace(
      /\s+(Common Stock|Class [A-Z] Common Stock|Capital Stock|Common Shares|Ordinary Shares|American Depositary Shares|Depositary Shares|Units|Warrants?)$/i,
      "",
    )
    .trim();
}

function infoToQuote(symbol: string, info: NasdaqInfo, assetClass: "stocks" | "etf"): Quote {
  const primary = info.primaryData ?? {};
  const price = parseNumber(primary.lastSalePrice);
  if (price === null || price <= 0) {
    throw new NasdaqError(`Nasdaq 未返回 ${symbol} 的有效报价`, 404, "not_found");
  }

  // 只给出 netChange / percentageChange 之一时也能补齐成自洽的涨跌三元组
  const reconciled = reconcileChange({
    price,
    change: parseNumber(primary.netChange),
    changePercent: parseNumber(primary.percentageChange),
  });

  // 盘前 / 盘后时 primaryData 就是扩展时段成交，secondaryData 是上一个常规收盘
  const session = sessionFromNasdaqStatus(info.marketStatus);
  const marketTime = parseDate(primary.lastTradeTimestamp);
  const extended: ExtendedQuote | null =
    (session === "pre" || session === "post") && reconciled.changePercent !== null
      ? {
          session,
          price,
          change: reconciled.change,
          changePercent: reconciled.changePercent,
          marketTime,
          volume: parseNumber(primary.volume),
        }
      : null;

  return {
    symbol: (info.symbol || symbol).toUpperCase(),
    name: cleanCompanyName(info.companyName, symbol),
    price,
    previousClose: reconciled.previousClose,
    change: reconciled.change,
    changePercent: reconciled.changePercent,
    currency: "USD",
    exchange: info.exchange || (assetClass === "etf" ? "ETF" : "NASDAQ"),
    marketTime,
    sparkline: [],
    source: "nasdaq",
    estimated: false,
    session,
    extended,
  };
}


/* -------------------------------------------------------------------------- */
/*                                  对外 API                                    */
/* -------------------------------------------------------------------------- */

const RANGE_DAYS: Record<"1M" | "3M" | "6M" | "1Y" | "5Y" | "MAX", number> = {
  "1M": 45,
  "3M": 110,
  "6M": 220,
  "1Y": 400,
  "5Y": 1900,
  MAX: 11000,
};

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function daysAgo(days: number): string {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/** 批量报价（4 个并发），单个失败不影响其它代码 */
export async function nasdaqQuotes(symbols: string[]): Promise<{
  quotes: Quote[];
  errors: { symbol: string; message: string }[];
}> {
  const results = await mapLimit(symbols, 4, async (symbol) => {
    try {
      const info = await fetchInfo(symbol);
      const assetClass = assetClassCache.get(symbol) ?? "stocks";
      return { quote: infoToQuote(symbol, info, assetClass) };
    } catch (error) {
      return {
        error: {
          symbol,
          message: error instanceof Error ? error.message : "Nasdaq 获取报价失败",
        },
      };
    }
  });

  const quotes: Quote[] = [];
  const errors: { symbol: string; message: string }[] = [];
  for (const result of results) {
    if (result.quote) quotes.push(result.quote);
    if (result.error) errors.push(result.error);
  }
  return { quotes, errors };
}

function bucketKey(timestamp: number, mode: "week" | "month" | "quarter"): number {
  const date = new Date(timestamp * 1000);
  if (mode === "month") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
  }
  if (mode === "quarter") {
    return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1) / 1000;
  }
  const day = date.getUTCDay();
  const diff = (day + 6) % 7; // 以周一为一周起点
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diff),
  );
  return monday.getTime() / 1000;
}

/** 把日线聚合为周线 / 月线 / 季线 */
function aggregate(points: ChartPoint[], mode: "week" | "month" | "quarter"): ChartPoint[] {
  const groups = new Map<number, ChartPoint[]>();
  for (const point of points) {
    const key = bucketKey(point.t, mode);
    const group = groups.get(key);
    if (group) group.push(point);
    else groups.set(key, [point]);
  }

  return Array.from(groups.values())
    .map((group) => {
      const volumes = group
        .map((point) => point.volume)
        .filter((value): value is number => value !== null);
      return {
        t: group[group.length - 1].t,
        open: group[0].open,
        close: group[group.length - 1].close,
        high: Math.max(...group.map((point) => point.high ?? point.close)),
        low: Math.min(...group.map((point) => point.low ?? point.close)),
        volume: volumes.length > 0 ? volumes.reduce((sum, value) => sum + value, 0) : null,
      } satisfies ChartPoint;
    })
    .sort((a, b) => a.t - b.t);
}

interface NasdaqSummaryField {
  label?: string;
  value?: string | number | null;
}

interface NasdaqSummary {
  symbol?: string;
  summaryData?: Record<string, NasdaqSummaryField | undefined> | null;
}

interface NasdaqDividends {
  dividendHeaderValues?: Array<{ label?: string; value?: string | number | null }> | null;
}

/** 解析 Nasdaq 摘要里的 "351.73/243.42"（高/低） */
function parseHighLow(value: string | number | null | undefined): {
  low: number | null;
  high: number | null;
} {
  if (value === null || value === undefined) return { low: null, high: null };
  const [high, low] = String(value)
    .split("/")
    .map((part) => parseNumber(part));
  return { low: low ?? null, high: high ?? null };
}

function summaryValue(
  summary: Record<string, NasdaqSummaryField | undefined> | null | undefined,
  ...keys: string[]
): string | number | null {
  if (!summary) return null;
  for (const key of keys) {
    const value = summary[key]?.value;
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

/**
 * Nasdaq 基本面兜底：/quote/{symbol}/summary + /quote/{symbol}/dividends。
 * 不含 EPS（Nasdaq 摘要接口没有该字段），因此 EPS 返回 null。
 */
export async function nasdaqFundamentals(symbol: string): Promise<Fundamentals> {
  const cachedClass = assetClassCache.get(symbol);
  const candidates: Array<"stocks" | "etf"> = cachedClass ? [cachedClass] : ["stocks", "etf"];

  let summary: NasdaqSummary | null = null;
  let assetClass: "stocks" | "etf" = "stocks";
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      summary = await requestNasdaq<NasdaqSummary>(
        `/quote/${encodeURIComponent(symbol)}/summary?assetclass=${candidate}`,
      );
      assetClass = candidate;
      assetClassCache.set(symbol, candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!summary?.summaryData) {
    throw lastError instanceof Error
      ? lastError
      : new NasdaqError("Nasdaq 未返回该代码的基本面数据", 404, "not_found");
  }

  // 股息接口里带 P/E Ratio；info 接口提供现价（用于推算 EPS），失败都不影响其它字段
  const [dividends, info] = await Promise.all([
    requestNasdaq<NasdaqDividends>(
      `/quote/${encodeURIComponent(symbol)}/dividends?assetclass=${assetClass}`,
    ).catch(() => null),
    fetchInfo(symbol).catch(() => null),
  ]);

  const data = summary.summaryData;
  const week52 = parseHighLow(summaryValue(data, "FiftTwoWeekHighLow", "FiftyTwoWeekHighLow"));
  const peField = dividends?.dividendHeaderValues?.find((item) => /P\/E/i.test(item.label ?? ""));
  const peRatio = parseNumber(peField?.value);
  const price = parseNumber(info?.primaryData?.lastSalePrice);
  // EPS(TTM) = 现价 ÷ 市盈率(TTM)：Nasdaq 摘要接口没有原生 EPS 字段，这里做等价推算
  const eps =
    peRatio !== null && peRatio > 0 && price !== null && price > 0
      ? Number((price / peRatio).toFixed(4))
      : null;

  return {
    symbol: (summary.symbol || symbol).toUpperCase(),
    currency: "USD",
    marketCap: parseNumber(summaryValue(data, "MarketCap")),
    peRatio,
    forwardPe: null,
    eps,
    epsDerived: eps !== null,
    dividendYield: parseNumber(summaryValue(data, "Yield", "DividendYield")),
    beta: parseNumber(summaryValue(data, "Beta")),
    averageVolume: parseNumber(
      summaryValue(data, "AverageVolume", "AvgDailyVol20Days", "AvgDailyVol65Days", "FiftyDayAvgDailyVol"),
    ),
    week52High: week52.high,
    week52Low: week52.low,
    oneYearTarget: parseNumber(summaryValue(data, "OneYrTarget")),
    sector: (summaryValue(data, "Sector") as string | null) ?? null,
    industry: (summaryValue(data, "Industry") as string | null) ?? null,
    source: "nasdaq",
    fetchedAt: new Date().toISOString(),
  };
}

/** 获取日线及以上的走势（纳斯达克接口只有日线，周/月/季由本地聚合） */
export async function nasdaqChart(
  symbol: string,
  range: RangeKey,
  interval: IntervalKey,
): Promise<ChartResponse & { cached: boolean; stale: boolean }> {
  const intervalConfig = INTERVAL_CONFIG[interval];
  if (!intervalConfig.nasdaq) {
    throw new NasdaqError(
      `${intervalConfig.label}数据仅 Yahoo Finance 提供，当前无法使用 Nasdaq 兜底`,
      503,
      "unsupported_interval",
    );
  }
  if (range === "1D" || range === "5D") {
    throw new NasdaqError("Nasdaq 不提供分时数据，该周期暂时无法使用兜底数据源", 503);
  }

  const info = await fetchInfo(symbol);
  const assetClass = assetClassCache.get(symbol) ?? "stocks";
  const from = daysAgo(RANGE_DAYS[range]);
  const to = new Date().toISOString().slice(0, 10);

  const data = await requestNasdaq<NasdaqChart>(
    `/quote/${encodeURIComponent(symbol)}/chart?assetclass=${assetClass}&fromdate=${from}&todate=${to}`,
  );

  const rawPoints: ChartPoint[] = [];
  for (const row of data.chart ?? []) {
    const close = parseNumber(row.z?.close) ?? parseNumber(row.y);
    if (close === null || !row.x) continue;
    rawPoints.push({
      t: Math.floor(row.x / 1000),
      open: parseNumber(row.z?.open),
      high: parseNumber(row.z?.high),
      low: parseNumber(row.z?.low),
      close,
      volume: parseNumber(row.z?.volume),
    });
  }

  if (rawPoints.length === 0) {
    throw new NasdaqError("Nasdaq 没有返回该周期的走势数据", 404, "not_found");
  }

  const points =
    interval === "1wk"
      ? aggregate(rawPoints, "week")
      : interval === "1mo"
        ? aggregate(rawPoints, "month")
        : interval === "3mo"
          ? aggregate(rawPoints, "quarter")
          : rawPoints;

  const last = points[points.length - 1];
  const lastDaily = rawPoints[rawPoints.length - 1];
  const price = parseNumber(info.primaryData?.lastSalePrice) ?? last.close;
  const changeFromInfo = parseNumber(info.primaryData?.netChange);
  const reconciled = reconcileChange({
    price,
    // 优先用 info 的实时净变动反推昨收；没有时才用 chart 的 previousClose（口径更粗，不参与百分比推算）
    previousClose: changeFromInfo !== null ? price - changeFromInfo : null,
    change: changeFromInfo,
    changePercent: parseNumber(info.primaryData?.percentageChange),
  });
  const previousClose = reconciled.previousClose ?? parseNumber(data.previousClose);
  const week52 = parse52Week(info.keyStats?.fiftyTwoWeekHighLow?.value);
  const session = sessionFromNasdaqStatus(info.marketStatus);
  const marketTime = parseDate(info.primaryData?.lastTradeTimestamp);

  const quote: Quote = {
    symbol: (info.symbol || symbol).toUpperCase(),
    name: cleanCompanyName(info.companyName, symbol),
    price,
    previousClose,
    change: reconciled.change,
    changePercent: reconciled.changePercent,
    currency: "USD",
    exchange: info.exchange || (assetClass === "etf" ? "ETF" : "NASDAQ"),
    marketTime,
    sparkline: rawPoints.slice(-40).map((point) => point.close),
    source: "nasdaq",
    estimated: false,
    session,
    extended:
      (session === "pre" || session === "post") && reconciled.changePercent !== null
        ? {
            session,
            price,
            change: reconciled.change,
            changePercent: reconciled.changePercent,
            marketTime,
            volume: parseNumber(info.primaryData?.volume),
          }
        : null,
  };

  return {
    symbol: quote.symbol,
    name: quote.name,
    exchange: quote.exchange,
    currency: "USD",
    timezone: "America/New_York",
    range,
    interval,
    points,
    meta: {
      price,
      previousClose,
      change: reconciled.change,
      changePercent: reconciled.changePercent,
      dayHigh: lastDaily.high ?? last.high,
      dayLow: lastDaily.low ?? last.low,
      week52Low: week52.low,
      week52High: week52.high,
      volume: parseNumber(info.primaryData?.volume) ?? lastDaily.volume,
      currency: "USD",
    },
    quote,
    fetchedAt: new Date().toISOString(),
    cached: false,
    stale: false,
  };
}


