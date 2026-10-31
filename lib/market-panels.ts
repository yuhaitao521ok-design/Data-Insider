/**
 * 板块 / 跨资产的定义（纯常量，客户端也可安全引用）。
 * 数据拉取见 lib/markets.ts（依赖服务端模块，不能进客户端 bundle）。
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
export function isEtfLike(symbol: string): boolean {
  return !symbol.startsWith("^") && !symbol.includes("=") && !symbol.endsWith("-USD");
}
