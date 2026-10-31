import { cached } from "@/lib/cache";
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

export type MarketPanelKind = "sector" | "cross";

export interface MarketPanelDefinition {
  symbol: string;
  label: string;
  short: string;
  kind: MarketPanelKind;
  /** yield = 数值本身就是利率百分比（^TNX） */
  unit?: "yield" | "price" | "index";
}

export const MARKET_PANELS: MarketPanelDefinition[] = [
  { symbol: "XLK", label: "科技", short: "XLK", kind: "sector" },
  { symbol: "XLC", label: "通信", short: "XLC", kind: "sector" },
  { symbol: "XLY", label: "可选消费", short: "XLY", kind: "sector" },
  { symbol: "XLP", label: "必需消费", short: "XLP", kind: "sector" },
  { symbol: "XLF", label: "金融", short: "XLF", kind: "sector" },
  { symbol: "XLV", label: "医疗", short: "XLV", kind: "sector" },
  { symbol: "XLI", label: "工业", short: "XLI", kind: "sector" },
  { symbol: "XLE", label: "能源", short: "XLE", kind: "sector" },
  { symbol: "XLB", label: "原材料", short: "XLB", kind: "sector" },
  { symbol: "XLU", label: "公用事业", short: "XLU", kind: "sector" },
  { symbol: "XLRE", label: "房地产", short: "XLRE", kind: "sector" },
  { symbol: "^VIX", label: "VIX 恐慌指数", short: "VIX", kind: "cross", unit: "index" },
  { symbol: "^TNX", label: "美债 10 年", short: "US10Y", kind: "cross", unit: "yield" },
  { symbol: "DX-Y.NYB", label: "美元指数", short: "DXY", kind: "cross", unit: "index" },
  { symbol: "GC=F", label: "黄金", short: "GOLD", kind: "cross", unit: "price" },
  { symbol: "CL=F", label: "原油 WTI", short: "WTI", kind: "cross", unit: "price" },
  { symbol: "BTC-USD", label: "比特币", short: "BTC", kind: "cross", unit: "price" },
];

export const SECTOR_DEFINITIONS = MARKET_PANELS.filter((item) => item.kind === "sector");
export const CROSS_ASSET_DEFINITIONS = MARKET_PANELS.filter((item) => item.kind === "cross");
export const MARKET_PANEL_SYMBOLS = MARKET_PANELS.map((item) => item.symbol);

/** Nasdaq 能兜底的标的：ETF（板块）可以，指数 / 期货 / 加密不行 */
function isEtfLike(symbol: string): boolean {
  return !symbol.startsWith("^") && !symbol.includes("=") && !symbol.endsWith("-USD");
}

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
