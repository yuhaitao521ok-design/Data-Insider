import { cached } from "@/lib/cache";
import {
  MARKET_PANELS,
  MARKET_PANEL_SYMBOLS,
  isEtfLike,
  type MarketPanelKind,
} from "@/lib/market-panels";
import { nasdaqQuotes } from "@/lib/nasdaq";
import { startYahooCooldown, yahooAvailable } from "@/lib/market";
import { sinaFuturesQuotes } from "@/lib/sina";
import { getQuotes as yahooQuotes } from "@/lib/yahoo";
import type { Quote } from "@/lib/types";

/**
 * 右栏「市场全景」面板：板块热力图（11 个 SPDR 行业 ETF）+ 跨资产（VIX / 美债 / 美元 / 黄金 / 原油 / BTC）。
 *
 * 一次 Yahoo spark 拿全部代码；Yahoo 不可用时板块 ETF 退到 Nasdaq，
 * 跨资产（指数 / 期货 / 加密）没有免费兜底源，缺失就留空。
 */

export type { MarketPanelDefinition, MarketPanelKind } from "@/lib/market-panels";

export interface MarketPanelsResult {
  sectors: Quote[];
  crossAssets: Quote[];
  errors: { symbol: string; message: string }[];
  provider: string;
  fetchedAt: string;
}

export async function loadMarketPanels(): Promise<
  MarketPanelsResult & { cached: boolean; stale: boolean }
> {
  const key = `markets:${MARKET_PANEL_SYMBOLS.join(",")}`;

  const result = await cached(key, 30, 600, async () => {
    const collected = new Map<string, Quote>();
    const errors: { symbol: string; message: string }[] = [];

    if (yahooAvailable()) {
      try {
        const data = await yahooQuotes(MARKET_PANEL_SYMBOLS);
        for (const quote of data.quotes) collected.set(quote.symbol, quote);
        errors.push(...data.errors);
      } catch (error) {
        console.warn("[markets] Yahoo 失败，板块退到 Nasdaq：", (error as Error)?.message);
        startYahooCooldown();
      }
    }

    const missingEtfs = MARKET_PANEL_SYMBOLS.filter(
      (symbol) => !collected.has(symbol) && isEtfLike(symbol),
    );
    if (missingEtfs.length > 0) {
      const fallback = await nasdaqQuotes(missingEtfs).catch(() => ({
        quotes: [] as Quote[],
        errors: [] as { symbol: string; message: string }[],
      }));
      for (const quote of fallback.quotes) collected.set(quote.symbol, quote);
      errors.push(...fallback.errors);
    }

    // 跨资产里黄金 / 原油 还能用 Sina 兜底（VIX / 美元指数 / BTC 只有 Yahoo）
    const missingFutures = MARKET_PANEL_SYMBOLS.filter((symbol) => !collected.has(symbol));
    if (missingFutures.length > 0) {
      const futures = await sinaFuturesQuotes(missingFutures).catch(() => [] as Quote[]);
      for (const quote of futures) {
        if (!collected.has(quote.symbol)) collected.set(quote.symbol, quote);
      }
    }

    const pick = (kind: MarketPanelKind) =>
      MARKET_PANELS.filter((item) => item.kind === kind).flatMap((item) => {
        const quote = collected.get(item.symbol);
        return quote ? [quote] : [];
      });

    const sectors = pick("sector");
    const crossAssets = pick("cross");
    if (sectors.length === 0 && crossAssets.length === 0) {
      throw new Error("市场面板数据暂时不可用");
    }

    const sources = new Set([...sectors, ...crossAssets].map((quote) => quote.source));

    return {
      sectors,
      crossAssets,
      errors,
      provider: sources.size === 1 ? [...sources][0] : "mixed",
      fetchedAt: new Date().toISOString(),
    };
  });

  return { ...result.value, cached: result.cached, stale: result.stale };
}
