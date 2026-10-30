/**
 * 全球指数概览的标的定义（客户端与服务端共用，纯常量）。
 *
 * 全部通过 Yahoo Finance 获取；美股 ETF 在 Yahoo 不可用时还能退到 Nasdaq。
 * `label` 是卡片上的中文名，`short` 是右上角的小代码。
 */

export type IndexRegion = "us" | "apac";

export interface IndexDefinition {
  symbol: string;
  label: string;
  short: string;
  region: IndexRegion;
  /** 计价货币（加入自选股时用于格式化） */
  currency: string;
}

export const INDEX_DEFINITIONS: IndexDefinition[] = [
  { symbol: "SPY", label: "标普 500", short: "SPY", region: "us", currency: "USD" },
  { symbol: "QQQ", label: "纳斯达克 100", short: "QQQ", region: "us", currency: "USD" },
  { symbol: "DIA", label: "道琼斯 30", short: "DIA", region: "us", currency: "USD" },
  { symbol: "IWM", label: "罗素 2000", short: "IWM", region: "us", currency: "USD" },
  { symbol: "^HSI", label: "恒生指数", short: "HSI", region: "apac", currency: "HKD" },
  { symbol: "000001.SS", label: "上证指数", short: "SSE", region: "apac", currency: "CNY" },
  { symbol: "000300.SS", label: "沪深 300", short: "CSI 300", region: "apac", currency: "CNY" },
  { symbol: "^N225", label: "日经 225", short: "N225", region: "apac", currency: "JPY" },
  { symbol: "^KS11", label: "韩国综合", short: "KOSPI", region: "apac", currency: "KRW" },
  { symbol: "^STI", label: "新加坡 STI", short: "STI", region: "apac", currency: "SGD" },
];

export const INDEX_SYMBOLS: string[] = INDEX_DEFINITIONS.map((item) => item.symbol);

export const US_INDEX_SYMBOLS: string[] = INDEX_DEFINITIONS.filter(
  (item) => item.region === "us",
).map((item) => item.symbol);

export const INDEX_DEFINITION_MAP: Record<string, IndexDefinition> = Object.fromEntries(
  INDEX_DEFINITIONS.map((item) => [item.symbol, item]),
);
