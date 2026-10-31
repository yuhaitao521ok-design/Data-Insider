import { cached } from "@/lib/cache";
import { getChart as yahooChart, getQuotes as yahooQuotes, UpstreamError } from "@/lib/yahoo";
import { nasdaqChart, nasdaqQuotes } from "@/lib/nasdaq";
import {
  INTERVAL_CONFIG,
  defaultIntervalFor,
  isIntervalAllowed,
  type ChartResponse,
  type IntervalKey,
  type Quote,
  type RangeKey,
} from "@/lib/types";

/**
 * 数据源编排层：
 *   1. 优先 Yahoo Finance（数据最全，含分时）
 *   2. Yahoo 被限流时自动切换到 Nasdaq 官方接口（日线及以上周期）
 *   3. 报价还可以由路由层再退化到 Perplexity（见 /api/quotes）
 *
 * Yahoo 失败后会进入 60 秒冷却，避免每个请求都先撞一次 429。
 */

const YAHOO_COOLDOWN_MS = 60_000;
let yahooCooldownUntil = 0;

export type Provider = "yahoo" | "nasdaq";

/**
 * Nasdaq 兜底只覆盖美股 / ETF：
 * 指数（^VIX）、期货（GC=F）、加密（BTC-USD）、外汇（DX-Y.NYB）都没有，
 * 对这些代码直接跳过兜底，避免返回 "Symbol not exists." 这类误导性错误。
 */
export function nasdaqCovers(symbol: string): boolean {
  if (symbol.startsWith("^")) return false;
  if (symbol.includes("=")) return false;
  if (symbol.endsWith("-USD")) return false;
  if (/-[A-Z]{3}$/.test(symbol)) return false;
  return true;
}

export function yahooAvailable() {
  return Date.now() >= yahooCooldownUntil;
}

export function startYahooCooldown() {
  yahooCooldownUntil = Date.now() + YAHOO_COOLDOWN_MS;
}

export async function loadQuotes(symbols: string[]): Promise<{
  quotes: Quote[];
  errors: { symbol: string; message: string }[];
  fetchedAt: string;
  provider: Provider;
  cached: boolean;
  stale: boolean;
}> {
  const key = `market:quotes:${symbols.slice().sort().join(",")}`;

  const result = await cached(key, 15, 600, async () => {
    if (yahooAvailable()) {
      try {
        const data = await yahooQuotes(symbols);
        return { ...data, provider: "yahoo" as Provider };
      } catch (error) {
        if (error instanceof UpstreamError && error.code === "not_found") throw error;
        console.warn("[market] Yahoo 报价失败，切换 Nasdaq：", (error as Error)?.message);
        startYahooCooldown();
      }
    }

    const fallback = await nasdaqQuotes(symbols);
    if (fallback.quotes.length === 0) {
      console.warn("[market] Nasdaq 报价全部失败：", fallback.errors);
      const allMissing =
        fallback.errors.length === symbols.length &&
        fallback.errors.every((item) => /not exist|not found|invalid symbol/i.test(item.message));
      throw new UpstreamError(
        allMissing
          ? "未找到该股票代码，请检查拼写"
          : fallback.errors[0]?.message || "行情数据源暂时不可用，请稍后重试",
        allMissing ? 404 : 502,
        allMissing ? "not_found" : "upstream_error",
      );
    }

    return {
      quotes: fallback.quotes,
      errors: fallback.errors,
      fetchedAt: new Date().toISOString(),
      provider: "nasdaq" as Provider,
    };
  });

  return { ...result.value, cached: result.cached, stale: result.stale };
}

export async function loadChart(
  symbol: string,
  range: RangeKey,
  interval: IntervalKey = defaultIntervalFor(range),
): Promise<ChartResponse & { cached: boolean; stale: boolean }> {
  if (!isIntervalAllowed(range, interval)) {
    throw new UpstreamError(`周期 ${range} 不支持 ${interval} 间隔`, 400);
  }

  const intervalConfig = INTERVAL_CONFIG[interval];
  const key = `market:chart:${symbol}:${range}:${interval}`;

  const result = await cached(key, intervalConfig.freshSeconds, intervalConfig.staleSeconds, async () => {
    let yahooError: unknown = null;
    // 仅 Yahoo 支持的间隔（分时/小时/季线）即使在冷却期也值得再试一次，
    // 否则用户会在一分钟内完全无法查看这些间隔。
    const shouldTryYahoo = yahooAvailable() || !intervalConfig.nasdaq;

    if (shouldTryYahoo) {
      try {
        return await yahooChart(symbol, range, interval);
      } catch (error) {
        yahooError = error;
        if (error instanceof UpstreamError && error.code === "not_found") throw error;
        console.warn("[market] Yahoo 走势失败，切换 Nasdaq：", (error as Error)?.message);
        startYahooCooldown();
      }
    }

    if (intervalConfig.nasdaq && range !== "1D" && range !== "5D" && nasdaqCovers(symbol)) {
      try {
        return await nasdaqChart(symbol, range, interval);
      } catch (error) {
        console.warn("[market] Nasdaq 走势失败：", (error as Error)?.message);
        if (yahooError instanceof UpstreamError) throw yahooError;
        throw error;
      }
    }

    if (yahooError instanceof UpstreamError) {
      if (!nasdaqCovers(symbol)) {
        throw new UpstreamError(
          `${symbol} 的走势仅 Yahoo Finance 提供，当前不可用（${yahooError.message}）`,
          yahooError.status,
          yahooError.code,
        );
      }
      if (yahooError.code === "rate_limited") {
        throw new UpstreamError(
          `${intervalConfig.label}数据仅 Yahoo Finance 提供，当前触发限流；可稍后重试或切换到日线`, 
          429,
          "rate_limited",
        );
      }
      throw yahooError;
    }
    if (!intervalConfig.nasdaq) {
      throw new UpstreamError(
        `${intervalConfig.label}数据仅 Yahoo Finance 提供，Yahoo 当前不可用（限流中），请稍后重试或切换到日线/周线`,
        503,
        "rate_limited",
      );
    }
    throw new UpstreamError(
      "该间隔的走势数据暂时不可用，请稍后重试或切换间隔",
      503,
      "rate_limited",
    );
  });

  return { ...result.value, cached: result.cached, stale: result.stale };
}
