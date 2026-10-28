import { cached } from "@/lib/cache";
import { reconcileChange } from "@/lib/quote";
import {
  INTERVAL_CONFIG,
  RANGE_CONFIG,
  defaultIntervalFor,
  isIntervalAllowed,
  type ChartPoint,
  type ChartResponse,
  type IntervalKey,
  type Quote,
  type RangeKey,
  type SearchResult,
} from "@/lib/types";

/**
 * Yahoo Finance 非官方接口封装。
 *
 * 用到的三个端点都无需 API Key：
 *  - /v7/finance/spark        批量报价 + 迷你走势（一次请求拿整个自选股列表）
 *  - /v8/finance/chart/{sym}  历史 K 线（不同周期）
 *  - /v1/finance/search       代码/名称搜索
 *
 * Yahoo 对云机房 IP 比较敏感，会返回 429。这里做了主机轮换 + 退避重试，
 * 上层还有进程内缓存，尽量降低被限流的概率。
 */

const HOSTS = ["https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"];

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
};

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
    readonly code: "rate_limited" | "upstream_error" | "not_found" = "upstream_error",
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchYahooJson<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const host = HOSTS[(attempt + Math.floor(Math.random() * HOSTS.length)) % HOSTS.length];
    try {
      const response = await fetch(`${host}${path}`, {
        headers: BROWSER_HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new UpstreamError(
          response.status === 429
            ? "Yahoo Finance 触发限流（429），请稍后重试"
            : `Yahoo Finance 服务异常（${response.status}）`,
          429,
          "rate_limited",
        );
        await sleep(250 * (attempt + 1) + Math.random() * 250);
        continue;
      }

      if (response.status === 404) {
        throw new UpstreamError("未找到该代码的行情数据", 404, "not_found");
      }

      if (!response.ok) {
        throw new UpstreamError(`Yahoo Finance 返回异常状态（${response.status}）`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof UpstreamError && error.code === "not_found") throw error;
      lastError = error instanceof Error ? error : new Error("未知错误");
      await sleep(200 * (attempt + 1));
    }
  }

  throw lastError ?? new UpstreamError("Yahoo Finance 请求失败");
}

/* -------------------------------------------------------------------------- */
/*                                   类型                                      */
/* -------------------------------------------------------------------------- */

interface YahooMeta {
  symbol?: string;
  currency?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  longName?: string;
  shortName?: string;
  timezone?: string;
  exchangeTimezoneName?: string;
}

interface YahooIndicators {
  quote?: Array<{
    open?: (number | null)[];
    high?: (number | null)[];
    low?: (number | null)[];
    close?: (number | null)[];
    volume?: (number | null)[];
  }>;
}

interface YahooChartResult {
  meta: YahooMeta;
  timestamp?: number[];
  indicators: YahooIndicators;
}

interface YahooChartResponse {
  chart: {
    result: YahooChartResult[] | null;
    error: { code: string; description?: string } | null;
  };
}

interface YahooSparkResponse {
  spark: {
    result:
      | Array<{
          symbol: string;
          response:
            | Array<{
                meta: YahooMeta;
                timestamp?: number[];
                indicators: YahooIndicators;
              }>
            | null;
        }>
      | null;
    error: { code: string; description?: string } | null;
  };
}

/* -------------------------------------------------------------------------- */
/*                                  解析逻辑                                    */
/* -------------------------------------------------------------------------- */

function pickNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function buildQuote(meta: YahooMeta, sparkline: number[], symbolHint?: string): Quote {
  const symbol = (meta.symbol || symbolHint || "").toUpperCase();
  const price = pickNumber(meta.regularMarketPrice) ?? sparkline.at(-1) ?? 0;

  // 统一涨跌口径：优先用 meta.previousClose（上一个交易日收盘）+ price 重算，
  // 保证 change / changePercent 自洽；chartPreviousClose 是「区间起点前一日」的收盘
  // （可能是几个月甚至几年前），只在完全拿不到昨收时用于展示，绝不参与涨跌幅计算。
  const reconciled = reconcileChange({
    price,
    previousClose: pickNumber(meta.previousClose),
    changePercent: pickNumber(meta.regularMarketChangePercent),
  });
  const previousClose = reconciled.previousClose ?? pickNumber(meta.chartPreviousClose);

  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    price,
    previousClose,
    change: reconciled.change,
    changePercent: reconciled.changePercent,
    currency: meta.currency || "USD",
    exchange: meta.fullExchangeName || meta.exchangeName || "",
    marketTime:
      typeof meta.regularMarketTime === "number"
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : null,
    sparkline: sparkline.filter((n) => Number.isFinite(n)),
    source: "yahoo",
    estimated: false,
  };
}

function sparklineFrom(result: { timestamp?: number[]; indicators: YahooIndicators }): number[] {
  const closes = result.indicators.quote?.[0]?.close ?? [];
  return closes.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
}

function chartPointsFrom(result: YahooChartResult): ChartPoint[] {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators.quote?.[0];
  const closes = quote?.close ?? [];
  const points: ChartPoint[] = [];

  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    points.push({
      t: timestamps[i],
      open: pickNumber(quote?.open?.[i]),
      high: pickNumber(quote?.high?.[i]),
      low: pickNumber(quote?.low?.[i]),
      close,
      volume: pickNumber(quote?.volume?.[i]),
    });
  }

  return points;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/* -------------------------------------------------------------------------- */
/*                                  对外 API                                    */
/* -------------------------------------------------------------------------- */

async function fetchSpark(symbols: string[]): Promise<YahooSparkResponse> {
  const path = `/v7/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}&range=1d&interval=5m&includePrePost=false`;
  return fetchYahooJson<YahooSparkResponse>(path);
}

async function fetchChartRaw(
  symbol: string,
  rangeKey: RangeKey,
  intervalKey: IntervalKey,
): Promise<YahooChartResult> {
  const rangeConfig = RANGE_CONFIG[rangeKey];
  const intervalConfig = INTERVAL_CONFIG[intervalKey];
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${rangeConfig.range}&interval=${intervalConfig.yahoo}&includePrePost=false&events=div%2Csplit`;
  const data = await fetchYahooJson<YahooChartResponse>(path);
  const result = data.chart?.result?.[0];
  if (!result) {
    throw new UpstreamError(
      data.chart?.error?.description || "未找到该代码的行情数据",
      404,
      "not_found",
    );
  }
  return result;
}

/** 用 chart 接口兜底单个代码（spark 偶尔会漏掉某些标的） */
async function quoteFromChart(symbol: string): Promise<Quote> {
  const result = await fetchChartRaw(symbol, "1D", "5m");
  return buildQuote(result.meta, sparklineFrom(result), symbol);
}

/**
 * 批量报价。优先走 spark（一次请求拿全部），失败的代码再用 chart 逐个兜底。
 * 缓存策略：15 秒新鲜期 + 10 分钟宽限期（stale-while-revalidate）。
 */
export async function getQuotes(symbols: string[]): Promise<{
  quotes: Quote[];
  errors: { symbol: string; message: string }[];
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
}> {
  const key = `quotes:${symbols.slice().sort().join(",")}`;
  const result = await cached(key, 15, 600, async () => {
    const quotes: Quote[] = [];
    const errors: { symbol: string; message: string }[] = [];
    let missing: string[] = [];

    try {
      const data = await fetchSpark(symbols);
      if (data.spark?.error) {
        throw new UpstreamError(data.spark.error.description || "Yahoo 返回错误");
      }
      for (const item of data.spark?.result ?? []) {
        const response = item.response?.[0];
        if (!response) {
          missing.push(item.symbol);
          continue;
        }
        quotes.push(buildQuote(response.meta, sparklineFrom(response), item.symbol));
      }
    } catch (error) {
      // spark 整体失败（多为 429）时不再逐个打 chart 接口，避免放大限流，
      // 交给上层切换到 Nasdaq 兜底数据源。
      throw error;
    }

    if (missing.length > 0) {
      const salvaged = await mapLimit(missing, 3, async (symbol) => {
        try {
          return { quote: await quoteFromChart(symbol) };
        } catch (error) {
          return {
            error: {
              symbol,
              message: error instanceof Error ? error.message : "获取行情失败",
            },
          };
        }
      });
      for (const item of salvaged) {
        if ("quote" in item && item.quote) quotes.push(item.quote);
        if ("error" in item && item.error) errors.push(item.error);
      }
    }

    if (quotes.length === 0) {
      throw new UpstreamError(errors[0]?.message || "Yahoo Finance 暂时不可用，请稍后重试", 429);
    }

    const order = new Map(symbols.map((symbol, index) => [symbol, index]));
    quotes.sort((a, b) => (order.get(a.symbol) ?? 99) - (order.get(b.symbol) ?? 99));

    return { quotes, errors, fetchedAt: new Date().toISOString() };
  });

  return { ...result.value, cached: result.cached, stale: result.stale };
}

/** 获取单个标的指定周期的走势 + 报价 */
export async function getChart(
  symbol: string,
  range: RangeKey,
  interval: IntervalKey = defaultIntervalFor(range),
): Promise<ChartResponse & { cached: boolean; stale: boolean }> {
  if (!isIntervalAllowed(range, interval)) {
    throw new UpstreamError(`周期 ${range} 不支持 ${interval} 间隔`, 400);
  }
  const intervalConfig = INTERVAL_CONFIG[interval];
  const key = `chart:${symbol}:${range}:${interval}`;
  const result = await cached(key, intervalConfig.freshSeconds, intervalConfig.staleSeconds, async () => {
    const raw = await fetchChartRaw(symbol, range, interval);
    const points = chartPointsFrom(raw);
    if (points.length === 0) {
      throw new UpstreamError("该代码在该周期内没有可用的行情数据", 404, "not_found");
    }

    const meta = raw.meta;
    const quote = buildQuote(meta, points.slice(-60).map((point) => point.close));
    const highs = points.map((point) => point.high ?? point.close);
    const lows = points.map((point) => point.low ?? point.close);

    return {
      symbol: symbol.toUpperCase(),
      name: quote.name,
      exchange: quote.exchange,
      currency: quote.currency,
      timezone: meta.exchangeTimezoneName || "America/New_York",
      range,
      interval,
      points,
      meta: {
        price: quote.price,
        previousClose: quote.previousClose,
        change: quote.change,
        changePercent: quote.changePercent,
        dayHigh: pickNumber(meta.regularMarketDayHigh, Math.max(...highs)),
        dayLow: pickNumber(meta.regularMarketDayLow, Math.min(...lows)),
        week52High: pickNumber(meta.fiftyTwoWeekHigh),
        week52Low: pickNumber(meta.fiftyTwoWeekLow),
        volume: pickNumber(meta.regularMarketVolume),
        currency: quote.currency,
      },
      quote,
      fetchedAt: new Date().toISOString(),
    } satisfies ChartResponse;
  });

  return { ...result.value, cached: result.cached, stale: result.stale };
}

/** 代码 / 公司名搜索 */
export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const key = `search:${query.toLowerCase()}`;
  const result = await cached(key, 30, 600, async () => {
    const path = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=true`;
    const data = await fetchYahooJson<{
      quotes?: Array<{
        symbol?: string;
        shortname?: string;
        longname?: string;
        exchange?: string;
        exchDisp?: string;
        quoteType?: string;
        isYahooFinance?: boolean;
      }>;
    }>(path);

    const allowed = new Set([
      "EQUITY",
      "ETF",
      "INDEX",
      "MUTUALFUND",
      "CRYPTOCURRENCY",
      "CURRENCY",
    ]);

    return (data.quotes ?? [])
      .filter((item) => item.symbol && item.isYahooFinance !== false)
      .filter((item) => !item.quoteType || allowed.has(item.quoteType))
      .map<SearchResult>((item) => ({
        symbol: (item.symbol as string).toUpperCase(),
        name: item.longname || item.shortname || item.symbol || "",
        exchange: item.exchDisp || item.exchange || "",
        type: item.quoteType || "EQUITY",
      }));
  });

  return result.value;
}


