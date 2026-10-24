/** 供前后端共用的行情类型定义 */

export const RANGE_KEYS = ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"] as const;

export type RangeKey = (typeof RANGE_KEYS)[number];

export type QuoteSource = "yahoo" | "nasdaq" | "perplexity";

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  /** 百分比数值，例如 -1.42 表示 -1.42% */
  changePercent: number | null;
  currency: string;
  exchange: string;
  /** 最新成交时间（ISO 8601） */
  marketTime: string | null;
  /** 盘中迷你走势的收盘价序列 */
  sparkline: number[];
  source: QuoteSource;
  /** 兜底数据（例如 Perplexity 估算）时为 true */
  estimated: boolean;
}

export interface QuotesResponse {
  quotes: Quote[];
  errors: { symbol: string; message: string }[];
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  provider?: QuoteSource;
}

export interface ChartPoint {
  /** 秒级 Unix 时间戳 */
  t: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface ChartMeta {
  price: number;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  currency: string;
}

export interface ChartResponse {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  timezone: string;
  range: RangeKey;
  interval: string;
  points: ChartPoint[];
  meta: ChartMeta;
  quote: Quote;
  fetchedAt: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface InsightResponse {
  symbol: string;
  range: RangeKey;
  summary: string;
  bullets: string[];
  sentiment: "bullish" | "neutral" | "bearish";
  risks: string[];
  citations: { title: string; url: string }[];
  model: string;
  generatedAt: string;
}

export interface ApiErrorBody {
  error: string;
  code?:
    | "invalid_request"
    | "not_found"
    | "rate_limited"
    | "upstream_error"
    | "missing_perplexity_key"
    | "perplexity_error";
}

export const RANGE_CONFIG: Record<
  RangeKey,
  { label: string; range: string; interval: string; freshSeconds: number; staleSeconds: number }
> = {
  "1D": { label: "1天", range: "1d", interval: "5m", freshSeconds: 30, staleSeconds: 900 },
  "5D": { label: "5天", range: "5d", interval: "15m", freshSeconds: 60, staleSeconds: 1800 },
  "1M": { label: "1月", range: "1mo", interval: "1d", freshSeconds: 300, staleSeconds: 3600 },
  "3M": { label: "3月", range: "3mo", interval: "1d", freshSeconds: 600, staleSeconds: 7200 },
  "6M": { label: "6月", range: "6mo", interval: "1d", freshSeconds: 900, staleSeconds: 10800 },
  "1Y": { label: "1年", range: "1y", interval: "1d", freshSeconds: 900, staleSeconds: 10800 },
  "5Y": { label: "5年", range: "5y", interval: "1wk", freshSeconds: 1800, staleSeconds: 21600 },
  MAX: { label: "全部", range: "max", interval: "1mo", freshSeconds: 3600, staleSeconds: 43200 },
};

export const DEFAULT_WATCHLIST = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "SPY",
] as const;

export function isRangeKey(value: string | null | undefined): value is RangeKey {
  return !!value && (RANGE_KEYS as readonly string[]).includes(value.toUpperCase());
}

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9.^=-]{1,12}$/.test(symbol);
}
