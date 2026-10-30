import { cached } from "@/lib/cache";
import { YAHOO_BROWSER_HEADERS, resetYahooAuth, yahooAuth, yahooHosts } from "@/lib/yahoo-auth";
import { nasdaqFundamentals } from "@/lib/nasdaq";
import type { Fundamentals } from "@/lib/types";

interface YahooField {
  raw?: number;
  fmt?: string;
}

type YahooValue = YahooField | number | string | null | undefined;

function toNumber(value: YahooValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[,$%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value.raw === "number") return Number.isFinite(value.raw) ? value.raw : null;
  return null;
}

interface YahooSummaryResult {
  summaryDetail?: Record<string, YahooValue>;
  defaultKeyStatistics?: Record<string, YahooValue>;
  financialData?: Record<string, YahooValue>;
  price?: Record<string, YahooValue>;
  assetProfile?: { sector?: string; industry?: string };
}

interface YahooSummaryResponse {
  quoteSummary?: {
    result?: YahooSummaryResult[] | null;
    error?: { description?: string } | null;
  };
}

function mapYahooFundamentals(symbol: string, result: YahooSummaryResult): Fundamentals {
  const summary = result.summaryDetail ?? {};
  const stats = result.defaultKeyStatistics ?? {};
  const financial = result.financialData ?? {};
  const price = result.price ?? {};

  // Yahoo 的 dividendYield 是小数（0.0031 = 0.31%），部分标的会直接给百分数
  const rawYield = toNumber(summary.dividendYield);
  const dividendYield = rawYield === null ? null : rawYield <= 1 ? rawYield * 100 : rawYield;

  return {
    symbol: String(price.symbol ?? symbol).toUpperCase() || symbol,
    currency: String(price.currency ?? summary.currency ?? "USD"),
    marketCap: toNumber(price.marketCap) ?? toNumber(summary.marketCap),
    peRatio: toNumber(summary.trailingPE) ?? toNumber(stats.trailingPE),
    forwardPe: toNumber(summary.forwardPE) ?? toNumber(stats.forwardPE),
    eps: toNumber(stats.trailingEps) ?? toNumber(financial.earningsPerShare),
    dividendYield,
    beta: toNumber(summary.beta) ?? toNumber(stats.beta),
    averageVolume: toNumber(summary.averageVolume) ?? toNumber(summary.averageDailyVolume10Day),
    week52High: toNumber(summary.fiftyTwoWeekHigh) ?? toNumber(stats.fiftyTwoWeekHigh),
    week52Low: toNumber(summary.fiftyTwoWeekLow) ?? toNumber(stats.fiftyTwoWeekLow),
    oneYearTarget: toNumber(financial.targetMeanPrice),
    sector: result.assetProfile?.sector ?? null,
    industry: result.assetProfile?.industry ?? null,
    source: "yahoo",
    fetchedAt: new Date().toISOString(),
  };
}

async function yahooFundamentals(symbol: string): Promise<Fundamentals> {
  const auth = await yahooAuth();
  const modules = "summaryDetail,defaultKeyStatistics,financialData,price,assetProfile";
  const path = `/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const hosts = yahooHosts();
    const host = hosts[attempt % hosts.length];
    try {
      const response = await fetch(`${host}${path}`, {
        headers: { ...YAHOO_BROWSER_HEADERS, Cookie: auth.cookie },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status === 401 || response.status === 403) {
        resetYahooAuth(); // crumb 失效，下一次重新握手
        throw new Error("Yahoo 基本面接口授权失败");
      }
      if (!response.ok) {
        throw new Error(`Yahoo 基本面接口异常（${response.status}）`);
      }

      const data = (await response.json()) as YahooSummaryResponse;
      const result = data.quoteSummary?.result?.[0];
      if (!result) {
        throw new Error(data.quoteSummary?.error?.description || "Yahoo 没有返回基本面数据");
      }

      const mapped = mapYahooFundamentals(symbol, result);
      const empty =
        mapped.marketCap === null &&
        mapped.peRatio === null &&
        mapped.eps === null &&
        mapped.week52High === null;
      if (empty) throw new Error("Yahoo 返回的基本面数据为空");
      return mapped;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Yahoo 基本面请求失败");
}

/** 读取基本面（Yahoo 优先，Nasdaq 兜底，进程内缓存 10 分钟） */
export async function getFundamentals(
  symbol: string,
): Promise<Fundamentals & { cached: boolean }> {
  const key = `fundamentals:${symbol}`;
  const result = await cached(key, 600, 3600, async () => {
    try {
      return await yahooFundamentals(symbol);
    } catch (error) {
      console.warn("[fundamentals] Yahoo 失败，切换 Nasdaq：", (error as Error)?.message);
    }

    return nasdaqFundamentals(symbol);
  });

  return { ...result.value, cached: result.cached };
}
