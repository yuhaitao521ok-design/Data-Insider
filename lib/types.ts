/** 供前后端共用的行情类型定义 */

export const RANGE_KEYS = ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"] as const;

export type RangeKey = (typeof RANGE_KEYS)[number];

/**
 * 数据源支持的 K 线间隔（Yahoo Finance chart API）。
 * 1h 是 60m 的别名，这里统一用 60m；5d/3mo 属于稀有粒度，保留 3mo、暂不暴露 5d。
 */
export const INTERVAL_KEYS = [
  "1m",
  "2m",
  "5m",
  "15m",
  "30m",
  "60m",
  "90m",
  "1d",
  "5d",
  "1wk",
  "1mo",
  "3mo",
] as const;

export type IntervalKey = (typeof INTERVAL_KEYS)[number];

export type IntervalKind = "minute" | "hour" | "day" | "week" | "month" | "quarter";

export interface IntervalConfig {
  label: string;
  /** 下拉里的紧凑写法 */
  short: string;
  /** Yahoo chart API 的 interval 参数值 */
  yahoo: string;
  kind: IntervalKind;
  /** Nasdaq 兜底是否支持（只能通过日线聚合出日/周/月） */
  nasdaq: boolean;
  freshSeconds: number;
  staleSeconds: number;
}

export const INTERVAL_CONFIG: Record<IntervalKey, IntervalConfig> = {
  "1m": { label: "1 分钟", short: "1m", yahoo: "1m", kind: "minute", nasdaq: false, freshSeconds: 30, staleSeconds: 300 },
  "2m": { label: "2 分钟", short: "2m", yahoo: "2m", kind: "minute", nasdaq: false, freshSeconds: 30, staleSeconds: 300 },
  "5m": { label: "5 分钟", short: "5m", yahoo: "5m", kind: "minute", nasdaq: false, freshSeconds: 30, staleSeconds: 300 },
  "15m": { label: "15 分钟", short: "15m", yahoo: "15m", kind: "minute", nasdaq: false, freshSeconds: 60, staleSeconds: 600 },
  "30m": { label: "30 分钟", short: "30m", yahoo: "30m", kind: "minute", nasdaq: false, freshSeconds: 60, staleSeconds: 600 },
  "60m": { label: "1 小时", short: "1h", yahoo: "60m", kind: "hour", nasdaq: false, freshSeconds: 60, staleSeconds: 600 },
  "90m": { label: "90 分钟", short: "90m", yahoo: "90m", kind: "minute", nasdaq: false, freshSeconds: 60, staleSeconds: 600 },
  "1d": { label: "日线", short: "1D", yahoo: "1d", kind: "day", nasdaq: true, freshSeconds: 300, staleSeconds: 3600 },
  "5d": { label: "5 日线", short: "5D", yahoo: "5d", kind: "day", nasdaq: false, freshSeconds: 600, staleSeconds: 7200 },
  "1wk": { label: "周线", short: "1W", yahoo: "1wk", kind: "week", nasdaq: true, freshSeconds: 1800, staleSeconds: 21600 },
  "1mo": { label: "月线", short: "1M", yahoo: "1mo", kind: "month", nasdaq: true, freshSeconds: 3600, staleSeconds: 43200 },
  "3mo": { label: "季线", short: "3M", yahoo: "3mo", kind: "quarter", nasdaq: true, freshSeconds: 3600, staleSeconds: 43200 },
};

/**
 * 每个周期可选的间隔。规则来自 Yahoo chart API / yfinance 的校验：
 * - 1m 最多回溯 8 天
 * - 2m / 5m / 15m / 30m / 90m 最多回溯 60 天
 * - 60m 最多回溯 730 天
 * - 1d 及以上无限制
 */
export const RANGE_INTERVALS: Record<RangeKey, IntervalKey[]> = {
  "1D": ["1m", "2m", "5m", "15m", "30m", "60m", "90m"],
  "5D": ["1m", "2m", "5m", "15m", "30m", "60m", "90m"],
  "1M": ["2m", "5m", "15m", "30m", "60m", "90m", "1d", "1wk"],
  "3M": ["60m", "1d", "5d", "1wk"],
  "6M": ["60m", "1d", "5d", "1wk"],
  "1Y": ["60m", "1d", "5d", "1wk", "1mo"],
  "5Y": ["1d", "5d", "1wk", "1mo", "3mo"],
  MAX: ["1d", "5d", "1wk", "1mo", "3mo"],
};


export type QuoteSource = "yahoo" | "nasdaq" | "perplexity" | "sina";

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
  /** 当前所处交易时段：盘前 / 交易中 / 盘后 / 夜盘 / 已收盘 */
  session?: MarketSession;
  /** 盘前 / 盘后 / 夜盘的成交明细（此时 price 等主字段即为该时段的最新价） */
  extended?: ExtendedQuote | null;
}

/** 分时图各交易时段的时间范围（秒级 Unix 时间戳） */
export interface ChartSessions {
  pre?: [number, number] | null;
  regular?: [number, number] | null;
  post?: [number, number] | null;
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
  interval: IntervalKey;
  points: ChartPoint[];
  meta: ChartMeta;
  quote: Quote;
  /** 分时图（1D）的盘前 / 常规 / 盘后时间范围，用于绘制时段阴影 */
  sessions?: ChartSessions;
  fetchedAt: string;
}

/** 主图渲染模式：折线 / 蜡烛（K 线） */
export type ChartMode = "line" | "candle";

/** 基本面指标（市值 / 估值 / 分红 / 52 周区间） */
export interface Fundamentals {
  symbol: string;
  currency: string;
  /** 总市值（原币种） */
  marketCap: number | null;
  /** 市盈率 TTM */
  peRatio: number | null;
  /** 预期市盈率 */
  forwardPe: number | null;
  /** 每股收益 TTM */
  eps: number | null;
  /** EPS 是否由「现价 ÷ 市盈率」推算（Nasdaq 兜底时无原生 EPS 字段） */
  epsDerived?: boolean;
  /** 股息率，百分比数值（0.31 表示 0.31%） */
  dividendYield: number | null;
  beta: number | null;
  averageVolume: number | null;
  week52High: number | null;
  week52Low: number | null;
  oneYearTarget: number | null;
  sector: string | null;
  industry: string | null;
  source: "yahoo" | "nasdaq";
  fetchedAt: string;
}

/** 交易所当前的交易时段 */
export type MarketSession = "pre" | "regular" | "post" | "overnight" | "closed";

/** 盘前 / 盘后 / 夜盘的成交明细（价格与涨跌均相对上一个常规收盘价） */
export interface ExtendedQuote {
  session: "pre" | "post" | "overnight";
  price: number;
  change: number | null;
  changePercent: number | null;
  marketTime: string | null;
  /** 该时段成交量（Nasdaq 提供，Yahoo 无此字段） */
  volume: number | null;
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
  { label: string; range: string; defaultInterval: IntervalKey }
> = {
  "1D": { label: "1天", range: "1d", defaultInterval: "5m" },
  "5D": { label: "5天", range: "5d", defaultInterval: "15m" },
  "1M": { label: "1月", range: "1mo", defaultInterval: "1d" },
  "3M": { label: "3月", range: "3mo", defaultInterval: "1d" },
  "6M": { label: "6月", range: "6mo", defaultInterval: "1d" },
  "1Y": { label: "1年", range: "1y", defaultInterval: "1d" },
  "5Y": { label: "5年", range: "5y", defaultInterval: "1wk" },
  MAX: { label: "全部", range: "max", defaultInterval: "1mo" },
};

/** 自选股数量上限（客户端持久化、批量报价都按这个来） */
export const MAX_WATCHLIST = 50;

/** 单次 /api/quotes 请求允许的最大代码数（客户端会按 QUOTE_CHUNK_SIZE 分段） */
export const MAX_QUOTE_SYMBOLS = 60;

/** 客户端每段请求多少个代码（避免 URL 过长、也让单段失败不拖累全部） */
export const QUOTE_CHUNK_SIZE = 25;

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

export function isIntervalKey(value: string | null | undefined): value is IntervalKey {
  return !!value && (INTERVAL_KEYS as readonly string[]).includes(value);
}

/** 该周期是否允许这个间隔（受数据源回溯限制） */
export function isIntervalAllowed(range: RangeKey, interval: IntervalKey): boolean {
  return RANGE_INTERVALS[range].includes(interval);
}

export function defaultIntervalFor(range: RangeKey): IntervalKey {
  return RANGE_CONFIG[range].defaultInterval;
}

/** 取合法的间隔：不合法时回退到该周期的默认值 */
export function resolveInterval(range: RangeKey, value: string | null | undefined): IntervalKey {
  if (isIntervalKey(value) && isIntervalAllowed(range, value)) return value;
  return defaultIntervalFor(range);
}

export function isIntradayInterval(interval: IntervalKey): boolean {
  const kind = INTERVAL_CONFIG[interval].kind;
  return kind === "minute" || kind === "hour";
}

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbol(symbol: string): boolean {
  return /^[A-Z0-9.^=-]{1,12}$/.test(symbol);
}
