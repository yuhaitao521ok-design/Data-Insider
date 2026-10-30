import { cached } from "@/lib/cache";
import { INDEX_SYMBOLS, US_INDEX_SYMBOLS } from "@/lib/index-groups";
import { nasdaqQuotes } from "@/lib/nasdaq";
import { startYahooCooldown, yahooAvailable } from "@/lib/market";
import { sinaIndexQuotes } from "@/lib/sina";
import { getQuotes as yahooQuotes } from "@/lib/yahoo";
import type { Quote } from "@/lib/types";

/**
 * 全球指数（美股 ETF + 亚太指数）。
 *
 *  1. 主数据源：Yahoo spark —— 一次请求拿全部 10 个代码（含迷你走势与涨跌幅）
 *  2. Yahoo 不可用或漏数据时：
 *     - 美股 ETF 退到 Nasdaq（SPY / QQQ / DIA / IWM）
 *     - 亚太指数退到 Sina（恒生 / 上证 / 沪深 300 / 日经；Sina 没有 KOSPI、STI 与迷你走势）
 *  3. 结果缓存 30 秒
 */

export interface IndicesResult {
  quotes: Quote[];
  errors: { symbol: string; message: string }[];
  provider: string;
  fetchedAt: string;
}

export async function loadIndices(): Promise<
  IndicesResult & { cached: boolean; stale: boolean }
> {
  const key = `indices:${INDEX_SYMBOLS.join(",")}`;

  const result = await cached(key, 30, 600, async () => {
    const collected = new Map<string, Quote>();
    const errors: { symbol: string; message: string }[] = [];

    if (yahooAvailable()) {
      try {
        const data = await yahooQuotes(INDEX_SYMBOLS);
        for (const quote of data.quotes) collected.set(quote.symbol, quote);
        errors.push(...data.errors);
      } catch (error) {
        console.warn("[indices] Yahoo 指数失败，切换兜底源：", (error as Error)?.message);
        startYahooCooldown();
      }
    }

    const missing = INDEX_SYMBOLS.filter((symbol) => !collected.has(symbol));
    if (missing.length > 0) {
      const missingUs = missing.filter((symbol) => US_INDEX_SYMBOLS.includes(symbol));

      const [usFallback, sinaFallback] = await Promise.all([
        missingUs.length > 0
          ? nasdaqQuotes(missingUs).catch(() => ({ quotes: [] as Quote[], errors: [] }))
          : Promise.resolve({ quotes: [] as Quote[], errors: [] }),
        // Nasdaq 也拿不到的（或亚太指数）用 Sina 兜底，一次请求拿全部
        sinaIndexQuotes(missing).catch(() => [] as Quote[]),
      ]);


      for (const quote of usFallback.quotes) collected.set(quote.symbol, quote);
      errors.push(...usFallback.errors);
      for (const quote of sinaFallback) {
        if (!collected.has(quote.symbol)) collected.set(quote.symbol, quote);
      }
    }

    if (collected.size === 0) {
      throw new Error(errors[0]?.message || "指数行情暂时不可用");
    }

    const quotes = INDEX_SYMBOLS.flatMap((symbol) => {
      const quote = collected.get(symbol);
      return quote ? [quote] : [];
    });
    const sources = new Set(quotes.map((quote) => quote.source));

    return {
      quotes,
      errors,
      provider: sources.size === 1 ? [...sources][0] : "mixed",
      fetchedAt: new Date().toISOString(),
    };
  });

  return { ...result.value, cached: result.cached, stale: result.stale };
}
