import { cached } from "@/lib/cache";
import { getChart as yahooChart, getQuotes as yahooQuotes, UpstreamError } from "@/lib/yahoo";
import { nasdaqChart, nasdaqQuotes } from "@/lib/nasdaq";
import { RANGE_CONFIG, type ChartResponse, type Quote, type RangeKey } from "@/lib/types";

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

function yahooAvailable() {
  return Date.now() >= yahooCooldownUntil;
}

function startYahooCooldown() {
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
): Promise<ChartResponse & { cached: boolean; stale: boolean }> {
  const config = RANGE_CONFIG[range];
  const key = `market:chart:${symbol}:${range}`;

  const result = await cached(key, config.freshSeconds, config.staleSeconds, async () => {
    let yahooError: unknown = null;

    if (yahooAvailable()) {
      try {
        return await yahooChart(symbol, range);
      } catch (error) {
        yahooError = error;
        if (error instanceof UpstreamError && error.code === "not_found") throw error;
        console.warn("[market] Yahoo 走势失败，切换 Nasdaq：", (error as Error)?.message);
        startYahooCooldown();
      }
    }

    if (range !== "1D" && range !== "5D") {
      try {
        return await nasdaqChart(symbol, range);
      } catch (error) {
        console.warn("[market] Nasdaq 走势失败：", (error as Error)?.message);
        if (yahooError instanceof UpstreamError) throw yahooError;
        throw error;
      }
    }

    if (yahooError instanceof UpstreamError) throw yahooError;
    throw new UpstreamError(
      "分时数据暂时不可用（Yahoo 限流），请稍后重试，或切换到 1 个月以上的周期",
      503,
      "rate_limited",
    );
  });

  return { ...result.value, cached: result.cached, stale: result.stale };
}
